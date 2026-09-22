import { RELIC_IDS, type RelicId, SKILLS, type SkillId } from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { generateSprint } from "@/game/core/map/generate";
import { allNodes, getNode } from "@/game/core/map/graph";
import { resetBotsForSprint, spawnBotsForSprint } from "@/game/core/rules/bots";
import { emit, type RuleContext } from "@/game/core/rules/context";
import { gainEnergy } from "@/game/core/rules/energy";
import { grantDevopsPoints } from "@/game/core/rules/grants";
import { energyMax } from "@/game/core/rules/modifiers";
import { arriveAt } from "@/game/core/rules/progress";

/**
 * A sprint closes on its release node: the work ships, the team gets a weekend,
 * a project improvement is chosen, and a faster rival walks in.
 *
 * The run has no ending. Difficulty is carried entirely by the bots — one more
 * every sprint up to four, each faster than the last — so "how long can you
 * keep this up" is the only question the game ever asks.
 */

export function endSprint(context: RuleContext): void {
  const { state } = context;

  grantDevopsPoints(context, BALANCE.devops.perSprint);

  const regen = Math.round(energyMax(state, context.effects) * BALANCE.energy.sprintEndRegenRatio);
  gainEnergy(context, regen, "sprint_end");

  const offer = drawRelicOffer(context);
  emit(context, { type: "sprint_ended", sprint: state.sprint, offer });

  if (offer.length === 0) {
    startNextSprint(context);
    return;
  }

  state.phase = { kind: "choose_relic", offer };
}

function drawRelicOffer(context: RuleContext): RelicId[] {
  const owned = new Set(context.state.relics);
  const available = RELIC_IDS.filter((id) => !owned.has(id));
  if (available.length === 0) return [];

  return context.rng.shuffle(available).slice(0, 3).sort();
}

export function startNextSprint(context: RuleContext): void {
  const { state } = context;

  state.sprint += 1;

  const previousRelease = getNode(state, state.player.nodeId);
  // Above everything already drawn, the rivals' columns included. They keep
  // writing while the sprint closes, so a sprint that only cleared the player's
  // own nodes opened on rows a rival had already taken.
  const offset =
    Math.max(
      ...allNodes(state).map((node) => node.depth),
      ...Object.values(state.botNodes).map((node) => node.depth),
    ) + 1;

  const plan = generateSprint({
    sprint: state.sprint,
    offset,
    skillPool: availableSkills(state.unlockedSkills, state.skills),
    rng: context.rng,
    serial: { next: state.nextNodeSerial },
    branchSerial: { next: state.nextBranchSerial },
  });

  // `generateSprint` works on its own serial cursors; copy them back so the
  // next injection does not reuse an id it already handed out.
  state.nextNodeSerial = maxSerial(plan.nodes) + 1;
  state.nextBranchSerial += plan.branches.length;

  for (const node of plan.nodes) state.nodes[node.id] = node;
  for (const branch of plan.branches) state.branches[branch.id] = branch;

  state.sprintLength = plan.length;
  previousRelease.next = [plan.startId];

  state.player.sprintProgress = 0;
  state.player.mainReached = 0;
  state.player.rerollUsed = false;

  resetBotsForSprint(state);
  spawnBotsForSprint(context);

  emit(context, { type: "sprint_started", sprint: state.sprint });
  arriveAt(context, plan.startId);
}

function maxSerial(nodes: { id: string }[]): number {
  let max = -1;
  for (const node of nodes) {
    const serial = Number(node.id.slice(node.id.indexOf(":") + 1));
    if (serial > max) max = serial;
  }
  return max;
}

/**
 * Feature skills that may still be placed on a branch: unlocked by the account,
 * not already earned this run, and never a bot trophy.
 */
export function availableSkills(
  unlocked: readonly SkillId[],
  owned: readonly SkillId[],
): SkillId[] {
  const ownedSet = new Set(owned);
  return [...unlocked]
    .filter((id) => SKILLS[id].source === "feature")
    .filter((id) => !ownedSet.has(id))
    .sort();
}
