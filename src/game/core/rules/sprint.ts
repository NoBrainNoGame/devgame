import { RELIC_IDS, type RelicId, type SkillId } from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { generateSprint } from "@/game/core/map/generate";
import { allNodes, getNode } from "@/game/core/map/graph";
import { emit, type RuleContext } from "@/game/core/rules/context";
import { gainEnergy } from "@/game/core/rules/energy";
import { grantDevopsPoints } from "@/game/core/rules/grants";
import { energyMax } from "@/game/core/rules/modifiers";
import { arriveAt } from "@/game/core/rules/progress";

/**
 * A sprint closes on its release node: the work ships, the team gets a weekend,
 * and a project improvement is chosen.
 *
 * The run has no ending: "how long can you keep this up" is the only question
 * the game ever asks.
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
  const offset = Math.max(...allNodes(state).map((node) => node.depth)) + 1;

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

  state.player.rerollUsed = false;

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
 * Skills that may still be placed on a branch: unlocked by the account and not
 * already earned this run.
 */
export function availableSkills(
  unlocked: readonly SkillId[],
  owned: readonly SkillId[],
): SkillId[] {
  const ownedSet = new Set(owned);
  return [...unlocked].filter((id) => !ownedSet.has(id)).sort();
}
