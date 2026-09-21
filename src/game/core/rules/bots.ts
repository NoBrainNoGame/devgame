import { BOT_ARCHETYPE_IDS, BOT_ARCHETYPES, type BotArchetypeId } from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { emit, type RuleContext } from "@/game/core/rules/context";
import { addDebt } from "@/game/core/rules/debt";
import { grantSkill } from "@/game/core/rules/grants";
import { reviewedRatio } from "@/game/core/rules/modifiers";
import type { Bot, RunState } from "@/game/core/types";

/**
 * The rivals.
 *
 * They work the way you do — commits, then a merge — but in a column of their
 * own, and they never touch a branch of yours. What makes them frightening is
 * that they never get a conflict and never need coffee. What they do get is
 * mistakes, and a mistake is a visible event you can read in the log and
 * exploit.
 *
 * Their column is to the left of `main`, one lane per rival, so the graph shows
 * four repositories being written side by side and you can see at a glance who
 * is further up.
 *
 * Reputation is deliberately not raw pace. Multiplying it by how much of your
 * code has actually been read is what stops "review" from being a turn thrown
 * away, and what makes the careful build a real strategy rather than a tax.
 */

/** A rival's pace this sprint: its archetype's, plus what every sprint adds. */
function paceForSprint(archetype: BotArchetypeId, sprint: number): number {
  return BOT_ARCHETYPES[archetype].speedPct + BALANCE.bots.speedPerSprint * (sprint - 1);
}

export function sortedBots(state: RunState): Bot[] {
  return Object.keys(state.bots)
    .sort()
    .map((id) => state.bots[id])
    .filter((bot): bot is Bot => bot !== undefined);
}

export function aliveBots(state: RunState): Bot[] {
  return sortedBots(state).filter((bot) => !bot.fired);
}

/** How many rivals the given sprint should be facing. */
export function botCountForSprint(sprint: number): number {
  const { startCount, perSprint, max } = BALANCE.bots;
  return Math.min(max, startCount + (sprint - 1) * perSprint);
}

export function spawnBotsForSprint(context: RuleContext): void {
  const { state } = context;
  const target = botCountForSprint(state.sprint);

  const used = new Set<BotArchetypeId>(aliveBots(state).map((bot) => bot.archetype));

  while (aliveBots(state).length < target) {
    const free = BOT_ARCHETYPE_IDS.filter((id) => !used.has(id));
    const archetype = free.length > 0 ? free[0] : context.rng.pick(BOT_ARCHETYPE_IDS);
    if (archetype === undefined) break;
    used.add(archetype);

    const def = BOT_ARCHETYPES[archetype];
    const id = `bot-${state.nextBotSerial}`;
    state.nextBotSerial += 1;

    state.bots[id] = {
      id,
      archetype,
      speedPct: paceForSprint(archetype, state.sprint),
      acc: 0,
      lane: botLane(state),
      featureCommits: 0,
      depth: currentDepth(state),
      sprintProgress: 0,
      totalProgress: 0,
      stalled: 0,
      debt: def.inheritedDebt,
      reputation: 0,
      firingProgress: 0,
      firingTurns: def.firingTurns,
      fired: false,
    };

    emit(context, { type: "bot_arrived", botId: id, archetype });
  }
}

/**
 * The leftmost free column for a new rival.
 *
 * Negative, and never -1: that one belongs to hotfixes, which have to read as
 * an interruption rather than as one more rival.
 */
function botLane(state: RunState): number {
  const taken = new Set(aliveBots(state).map((bot) => bot.lane));
  let lane = -2;
  while (taken.has(lane)) lane -= 1;
  return lane;
}

/** Where the graph currently is, so a newcomer starts level rather than below. */
function currentDepth(state: RunState): number {
  const head = state.nodes[state.player.nodeId];
  return head?.depth ?? 0;
}

/**
 * Puts every surviving rival back at the start of the new sprint, and speeds
 * them all up.
 *
 * The speed-up used to be applied only when a rival *spawned*, and the roster
 * caps at four — so nothing escalated after sprint four. A player who had
 * collected every skill, every DevOps level and every relic could then not be
 * killed by anything, which is what a run that never ends looks like from the
 * inside.
 */
export function resetBotsForSprint(state: RunState): void {
  for (const bot of aliveBots(state)) {
    bot.speedPct = paceForSprint(bot.archetype, state.sprint);
    bot.sprintProgress = 0;
    bot.acc = 0;
    bot.stalled = 0;
    bot.firingProgress = 0;
    bot.reputation = 0;
    bot.featureCommits = 0;
    bot.depth = Math.max(bot.depth, currentDepth(state));
  }
}

/**
 * One turn of rival work. Called after any action that consumes a turn, and
 * never after placing a DevOps point — that is the one move the bots do not
 * get paid for.
 */
export function advanceBots(context: RuleContext): void {
  const { state } = context;
  forgetOldBotNodes(state);
  // `main` is the anchor, one merge per feature, then the sprint merge and the
  // release: the features on offer are what is left.
  const ceiling = Math.max(0, state.sprintLength - 3);

  for (const bot of aliveBots(state)) {
    if (bot.stalled > 0) {
      bot.stalled -= 1;
      continue;
    }

    const def = BOT_ARCHETYPES[bot.archetype];

    if (context.rng.chance(def.mistakePct)) {
      bot.stalled = 1;
      emit(context, { type: "bot_mistake", botId: bot.id, archetype: bot.archetype });
      // The Rapide's mistakes land on a shared `main`, so they land on you.
      if (def.pressure.debtPerMistake !== undefined) {
        addDebt(context, def.pressure.debtPerMistake);
      }
      continue;
    }

    const before = bot.sprintProgress;
    bot.acc += bot.speedPct;

    while (bot.acc >= 100) {
      bot.acc -= 100;
      if (bot.sprintProgress >= ceiling) continue;

      writeBotCommit(context, bot);
    }

    if (bot.sprintProgress !== before) {
      emit(context, {
        type: "bot_advanced",
        botId: bot.id,
        from: before,
        to: bot.sprintProgress,
      });
    }
  }
}

/**
 * Drops rival commits that have scrolled far out of view.
 *
 * They are decoration: nothing walks them and no rule reads them. Keeping every
 * one of them makes the state copy the reducer takes on each action grow
 * without bound, which a long run feels as a slow turn.
 */
function forgetOldBotNodes(state: RunState): void {
  const floor = (state.nodes[state.player.nodeId]?.depth ?? 0) - BALANCE.bots.historyDepth;
  if (floor <= 0) return;

  for (const id of Object.keys(state.botNodes)) {
    if ((state.botNodes[id]?.depth ?? 0) < floor) delete state.botNodes[id];
  }
}

/**
 * One commit of rival work, and the merge that closes its feature.
 *
 * A rival's progress in the race is features delivered, exactly as the
 * player's is — so it has to actually write the commits and land the merge,
 * rather than have a number go up.
 */
function writeBotCommit(context: RuleContext, bot: Bot): void {
  const { state } = context;

  bot.depth += 1;
  bot.featureCommits += 1;

  const merged = bot.featureCommits >= BALANCE.bots.featureLength;
  const id = `bot:${state.nextBotNodeSerial}`;
  state.nextBotNodeSerial += 1;

  state.botNodes[id] = {
    id,
    botId: bot.id,
    kind: merged ? "feature_merge" : "commit",
    lane: bot.lane,
    depth: bot.depth,
  };

  if (merged) {
    bot.featureCommits = 0;
    bot.sprintProgress += 1;
    bot.totalProgress += 1;
  }

  emit(context, { type: "bot_committed", botId: bot.id, nodeId: id, merged });
}

/**
 * Reputation against each rival: how far ahead you are, weighted by how much
 * of your output has been read. Falling behind is not softened by quality —
 * being slow and careful still means being slow.
 */
export function updateReputation(context: RuleContext): void {
  const { state } = context;
  const ratio = reviewedRatio(state);
  const quality = BALANCE.reputation.qualityFloor + BALANCE.reputation.qualityRange * ratio;

  for (const bot of aliveBots(state)) {
    const pace = state.player.sprintProgress - bot.sprintProgress;
    bot.reputation = pace > 0 ? Math.round(pace * quality) : pace;
  }
}

/** Advances or decays every firing bar, and fires the bots that have filled. */
export function checkFiring(context: RuleContext): void {
  const { state } = context;
  const threshold = BALANCE.bots.firingReputationThreshold;

  for (const bot of aliveBots(state)) {
    if (bot.reputation >= threshold) bot.firingProgress += 1;
    else bot.firingProgress = Math.max(0, bot.firingProgress - 1);

    emit(context, {
      type: "reputation",
      botId: bot.id,
      value: bot.reputation,
      firingProgress: bot.firingProgress,
    });

    if (bot.firingProgress >= bot.firingTurns) fireBot(context, bot);
  }
}

function fireBot(context: RuleContext, bot: Bot): void {
  const { state } = context;
  const def = BOT_ARCHETYPES[bot.archetype];

  bot.fired = true;
  state.botsFired += 1;

  const xp = BALANCE.bots.firingXpPerSprint * state.sprint;
  const commits = BALANCE.bots.firingCommits;

  state.xpEarned += xp;
  state.player.totalCommits += commits;

  emit(context, {
    type: "bot_fired",
    botId: bot.id,
    archetype: bot.archetype,
    rewards: { xp, commits, debt: bot.debt, skillId: def.trophy },
  });

  // You inherit the work and the mess, in that order.
  grantSkill(context, def.trophy);
  addDebt(context, bot.debt);
}

/**
 * True when the player has spent long enough behind the leading rival to be
 * let go. Being briefly overtaken is a scare; staying overtaken is the end.
 */
export function checkOvertaken(context: RuleContext): boolean {
  const { state } = context;
  const alive = aliveBots(state);
  if (alive.length === 0) {
    state.player.overtakenStreak = 0;
    return false;
  }

  const leader = alive.reduce((best, bot) =>
    bot.sprintProgress > best.sprintProgress ? bot : best,
  );

  const gap = leader.sprintProgress - state.player.sprintProgress;
  if (gap >= BALANCE.bots.overtakenGap) state.player.overtakenStreak += 1;
  else state.player.overtakenStreak = 0;

  return state.player.overtakenStreak >= BALANCE.bots.overtakenStreak;
}

/** Extra weight a live rival adds to a failure it specialises in. */
export function failurePressure(state: RunState): {
  prRejected: number;
  forcedRebase: number;
  reviewerId: string | null;
} {
  let prRejected = 0;
  let forcedRebase = 0;
  let reviewerId: string | null = null;

  for (const bot of aliveBots(state)) {
    const pressure = BOT_ARCHETYPES[bot.archetype].pressure;
    if (pressure.prRejected !== undefined) {
      prRejected += pressure.prRejected;
      reviewerId ??= bot.id;
    }
    if (pressure.forcedRebase !== undefined) forcedRebase += pressure.forcedRebase;
  }

  return { prRejected, forcedRebase, reviewerId };
}
