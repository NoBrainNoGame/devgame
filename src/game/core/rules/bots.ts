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
 * They do not walk the graph; they hold a position on `main` and grind forward
 * at a fixed pace, which is exactly what makes them frightening — they never
 * get a conflict and never need coffee. What they do get is mistakes, and a
 * mistake is a visible event you can read in the log and exploit.
 *
 * Reputation is deliberately not raw pace. Multiplying it by how much of your
 * code has actually been read is what stops "review" from being a turn thrown
 * away, and what makes the careful build a real strategy rather than a tax.
 */

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
      speedPct: def.speedPct + BALANCE.bots.speedPerSprint * (state.sprint - 1),
      acc: 0,
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

/** Puts every surviving bot back at the top of the new sprint's main line. */
export function resetBotsForSprint(state: RunState): void {
  for (const bot of aliveBots(state)) {
    bot.sprintProgress = 0;
    bot.acc = 0;
    bot.stalled = 0;
    bot.firingProgress = 0;
    bot.reputation = 0;
  }
}

/**
 * One turn of rival work. Called after any action that consumes a turn, and
 * never after placing a DevOps point — that is the one move the bots do not
 * get paid for.
 */
export function advanceBots(context: RuleContext): void {
  const { state } = context;
  const ceiling = Math.max(0, state.sprintLength - 1);

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
      if (bot.sprintProgress < ceiling) {
        bot.sprintProgress += 1;
        bot.totalProgress += 1;
      }
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
