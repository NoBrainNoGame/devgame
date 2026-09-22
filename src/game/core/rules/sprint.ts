import { RELIC_IDS, type RelicId, type SkillId } from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { arriveTickets } from "@/game/core/map/tickets";
import { emit, type RuleContext } from "@/game/core/rules/context";
import { closeMonth } from "@/game/core/rules/economy";
import { gainEnergy } from "@/game/core/rules/energy";
import { recordIncident } from "@/game/core/rules/events";
import { grantSkillPoints } from "@/game/core/rules/grants";
import { energyMax } from "@/game/core/rules/modifiers";
import { isOver } from "@/game/core/rules/over";
import { lowerQuality, raiseQuality } from "@/game/core/rules/quality";
import { pullTeam } from "@/game/core/rules/team";
import { assignStaleTickets, sortedTickets } from "@/game/core/rules/tickets";
import { writeRelease, writeSprintStart } from "@/game/core/rules/write";
import type { RunState } from "@/game/core/types";

/**
 * A sprint is a box of turns. When it runs out — or when there is nothing left
 * on the board — the work ships: `dev` is merged into `main`, the release is
 * tagged, and production gets to say what it thinks of what was shipped
 * unread. Then the team gets a weekend, a project improvement is chosen, and
 * the next sprint's tickets arrive.
 *
 * The run has no ending: "how long can you keep this up" is the only question
 * the game ever asks.
 */

export function endSprint(context: RuleContext): void {
  const { state } = context;

  writeRelease(context);

  shipBugs(context);
  if (isOver(context)) return;

  // Every payday the sprint did not reach — all three, when the board
  // emptied early — falls due now.
  while (state.sprintMonths < BALANCE.economy.monthsPerSprint) {
    closeMonth(context);
    if (isOver(context)) return;
  }

  // A sprint you sat out is one production notices, however busy the team
  // was: without this, a full team and a resting player is a run that never
  // ends.
  const idle = state.sprintPlayerDelivered === 0;
  if (idle) {
    state.stats.idleSprints += 1;
    raiseQuality(context, BALANCE.quality.perIdleSprint, "idle_sprint");
    if (isOver(context)) return;
  }

  // A clean sprint earns patience back: nothing broke, nothing had to be
  // forced on you, and you landed something yourself. The forced tickets are
  // counted when the next sprint opens, so the flag is read here and reset
  // there.
  if (state.sprintIncidents === 0 && !state.sprintForced && !idle) {
    lowerQuality(context, BALANCE.quality.decayPerCleanSprint);
  }

  grantSkillPoints(context, BALANCE.tree.perSprint);

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

/**
 * The release finds what shipped unread. Every machine-written commit nobody
 * reviewed, and every conflict the machine fixed with a bug attached, rolls
 * for an incident. Hotfixes are exempt: a fix that breeds its own fix is a
 * spiral, not a tension.
 */
function shipBugs(context: RuleContext): void {
  const { state } = context;
  const shipped = [...state.shipped];
  state.shipped = [];

  const hotfixNodes = new Set<string>();
  for (const ticket of sortedTickets(state)) {
    if (ticket.kind === "hotfix") for (const id of ticket.nodeIds) hotfixNodes.add(id);
  }

  for (const id of shipped) {
    const node = state.nodes[id];
    if (node === undefined || hotfixNodes.has(id)) continue;

    const suspect =
      node.commit.hiddenBug === true || (node.commit.mode === "ai" && !node.commit.reviewed);
    if (!suspect) continue;

    if (!context.rng.chance(BALANCE.release.bugPerUnreadPct)) continue;
    recordIncident(context, "release", id);
    if (isOver(context)) return;
  }
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
  state.sprintTurn = 0;
  state.sprintIncidents = 0;
  state.sprintForced = false;
  state.sprintMonths = 0;
  state.sprintPlayerDelivered = 0;
  state.player.rerollUsed = false;
  state.phase = { kind: "choose_action" };

  writeSprintStart(context);

  // The team picks up what is waiting before the board forces it on you —
  // that is what a team is for. Then what is left is yours, then the new work
  // arrives on top.
  pullTeam(context);
  assignStaleTickets(context);
  arriveTickets(context, availableSkills(state));

  emit(context, { type: "sprint_started", sprint: state.sprint });
}

/**
 * Skills a new ticket may still grant: unlocked by the account, not already
 * earned this run, and not already promised by a ticket on the board.
 */
export function availableSkills(state: RunState): SkillId[] {
  const taken = new Set<SkillId>(state.skills);
  for (const ticket of Object.values(state.tickets)) {
    if (ticket.skillId !== undefined && ticket.status !== "merged") taken.add(ticket.skillId);
  }
  return [...state.unlockedSkills].filter((id) => !taken.has(id)).sort();
}
