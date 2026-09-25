import { type SfxId, sfxFor } from "@/game/audio/sfx";
import type { RevealSnapshot } from "@/game/bridge/reveal";
import { type I18nText, money, signed as signedAmount, text } from "@/game/core/i18n";
import { headOf } from "@/game/core/map/graph";
import { MAIN_LANE } from "@/game/core/map/layout";
import type { GameEvent, NodeId, RunState } from "@/game/core/types";
import { nodeX, nodeY } from "@/game/render/coords";
import { palette } from "@/game/render/palette";

/**
 * A turn's events, arranged into what the canvas plays.
 *
 * The engine writes everything at once and in its own order — a commit's
 * energy and debt are emitted *before* the commit itself, an incident before
 * the hotfix it opens. The story is told the other way round: the commit
 * appears, and what it cost lands on it. So the planner holds the pops back
 * until the reveal they belong to, and re-anchors them there.
 *
 * Pure, and tested on real runs: every pop is anchored on a commit that is on
 * screen by the time it plays, every commit the batch wrote is revealed exactly
 * once, and the order of reveals is the order the engine wrote them.
 */

export interface Point {
  x: number;
  y: number;
}

/** The HUD readouts a pop can move. */
export type GaugeId = "energy" | "health" | "patience" | "points" | "money" | "skills";

/**
 * What a pop tells the HUD: which gauge moves, by how much in the gauge's own
 * terms (a debt of +5 is a health of −5), and the value it lands on. The
 * code's health has no exact value mid-batch — its blur is only known at the
 * end — so its value is null and the HUD moves to the final one.
 */
export interface GaugeCue {
  gauge: GaugeId;
  delta: number;
  value: number | null;
  /** The ticket whose points bar moves, for a points cue. */
  ticketId?: string;
  /** Order within the batch: a late cue never moves a gauge back. */
  serial: number;
}

export type Step =
  | { kind: "reveal"; nodeId: NodeId; at: Point; asHead: boolean; hold: number }
  | { kind: "look"; y: number | null; hold: number }
  | {
      kind: "pop";
      anchor: NodeId;
      at: Point;
      caption: string;
      colour: number;
      hold: number;
      cue?: GaugeCue;
    }
  | { kind: "flash"; anchor: NodeId; at: Point; colour: number; hold: number }
  | { kind: "beat"; hold: number }
  /** A sound, placed after the effect of the event that makes it. */
  | { kind: "sfx"; id: SfxId };

/** Durations in milliseconds. Rendering, not rules, so not in `balance.ts`. */
export const STORY = {
  reveal: 220,
  pop: 650,
  popLong: 900,
  flash: 420,
  roll: 120,
  boundary: 200,
  look: 320,
  /** The review dialog's analysis. The canvas holds still while it reads. */
  review: 2800,
} as const;

interface Held {
  caption: string;
  colour: number;
  hold: number;
  cue?: GaugeCue;
}

export interface PlanOptions {
  /**
   * Whether a review holds the canvas still while its dialog reads the
   * ticket. A canvas nobody plays has no dialog, and a demo that waits
   * three seconds for one that never opens reads as stuck.
   */
  reviewHold?: boolean;
  /**
   * Whether money and skill points rise off the graph. Off for a purchase:
   * the shop shows the price paid itself, and the canvas under it has
   * nothing to tell.
   */
  economyPops?: boolean;
}

export function planBatch(
  events: readonly GameEvent[],
  state: RunState,
  shown: RevealSnapshot,
  translate: (text: I18nText) => string,
  options: PlanOptions = {},
): Step[] {
  const reviewHold = options.reviewHold ?? true;
  const economyPops = options.economyPops ?? true;
  let serial = 0;
  // A gain in the gauge's colour; any loss in the colour of a problem.
  const gaugePop = (
    gauge: GaugeId,
    delta: number,
    value: number | null,
    caption: string,
    gainColour: number,
    extra: { ticketId?: string } = {},
  ): void => {
    if (delta === 0) return;
    serial += 1;
    held.push({
      caption,
      colour: delta > 0 ? gainColour : palette.lane.hotfix,
      hold: STORY.pop,
      cue: { gauge, delta, value, serial, ...extra },
    });
  };
  const steps: Step[] = [];
  const held: Held[] = [];
  const revealed = new Set<NodeId>(shown.nodes);

  // Where the next pop lands: the last commit revealed, or the head that was
  // already on screen when the batch began.
  let cursor: NodeId | null = shown.headId;
  let away = false;

  const positionOf = (id: NodeId): Point | null => {
    const node = state.nodes[id];
    return node === undefined ? null : { x: nodeX(node.lane), y: nodeY(node.depth) };
  };

  const flush = (): void => {
    if (held.length === 0) return;
    const anchor = cursor;
    const at = anchor === null ? null : positionOf(anchor);
    if (anchor !== null && at !== null && revealed.has(anchor)) {
      for (const pop of held) steps.push({ kind: "pop", anchor, at, ...pop });
    }
    held.length = 0;
  };

  const flashAt = (colour: number): void => {
    flush();
    const at = cursor === null ? null : positionOf(cursor);
    if (cursor !== null && at !== null && revealed.has(cursor)) {
      steps.push({ kind: "flash", anchor: cursor, at, colour, hold: STORY.flash });
    }
  };

  for (const event of events) {
    switch (event.type) {
      case "node_done": {
        const at = positionOf(event.nodeId);
        if (at === null) break;
        const node = state.nodes[event.nodeId];
        // A release is not somewhere you stand: `main` is shipped, not
        // written. Nor is a colleague's commit: the team writes beside you,
        // and the camera stays with you.
        const asHead =
          node !== undefined && node.lane !== MAIN_LANE && node.commit.author === undefined;
        const byColleague = node !== undefined && node.commit.author !== undefined;
        // What was held so far is yours — a roll's cost, a point — and lands
        // where you stand, not on the commit a colleague just wrote.
        if (byColleague) flush();
        revealed.add(event.nodeId);
        if (!byColleague) {
          cursor = event.nodeId;
          away = false;
        }
        steps.push({ kind: "reveal", nodeId: event.nodeId, at, asHead, hold: STORY.reveal });
        flush();
        break;
      }

      // Every figure as the HUD reads it: the code's health and production's
      // patience are the debt and the impatience turned over.
      case "energy":
        gaugePop(
          "energy",
          event.delta,
          event.value,
          translate(text("fx.energy", { delta: signedAmount(event.delta) })),
          palette.energy,
        );
        break;

      case "debt":
        gaugePop(
          "health",
          -event.delta,
          null,
          translate(text("fx.health", { delta: signedAmount(-event.delta) })),
          palette.debt,
        );
        break;

      case "points":
        gaugePop(
          "points",
          event.delta,
          event.value,
          translate(text("fx.points", { delta: signedAmount(event.delta) })),
          // The ticket's points are the HUD's own figure: the accent.
          palette.lane.trunk,
          { ticketId: event.ticketId },
        );
        break;

      case "quality":
        gaugePop(
          "patience",
          -event.delta,
          event.max - event.value,
          translate(text("fx.patience", { delta: signedAmount(-event.delta) })),
          palette.patience,
        );
        break;

      case "money": {
        if (!economyPops) break;
        // A payday is revenue, then upkeep, then salaries: one figure, the net.
        const last = held[held.length - 1];
        const delta = last?.cue?.gauge === "money" ? last.cue.delta + event.delta : event.delta;
        if (last?.cue?.gauge === "money") held.pop();
        gaugePop(
          "money",
          delta,
          event.value,
          translate(
            text(delta >= 0 ? "fx.moneyGain" : "fx.moneyLoss", { amount: money(Math.abs(delta)) }),
          ),
          palette.money,
        );
        break;
      }

      case "skill_points":
        if (!economyPops) break;
        gaugePop(
          "skills",
          event.delta,
          event.value,
          translate(text("fx.skills", { delta: signedAmount(event.delta) })),
          palette.lane.trunk,
        );
        break;

      case "skill_gained":
        held.push({
          caption: translate({ key: `skills.${event.skillId}.name` }),
          colour: palette.lane.feature,
          hold: STORY.popLong,
        });
        break;

      case "reviewed":
        if (event.nodeIds.length > 0) {
          held.push({
            caption: `✓ ${event.nodeIds.length}`,
            colour: palette.node.craft,
            hold: STORY.pop,
          });
        }
        break;

      case "squashed":
        held.push({
          caption: `⊟ ${event.nodeIds.length}`,
          colour: palette.lane.refactor,
          hold: STORY.pop,
        });
        break;

      case "docs_used":
        held.push({ caption: "¶", colour: palette.lane.refactor, hold: STORY.pop });
        break;

      case "checkout": {
        // The camera goes to the ticket picked up: its tip, or `dev` if it has
        // not been forked yet.
        flush();
        const head = headOf(state);
        cursor = revealed.has(head.id) ? head.id : cursor;
        away = true;
        steps.push({ kind: "look", y: nodeY(head.depth), hold: STORY.look });
        break;
      }

      case "conflict":
      case "incident":
        flashAt(palette.lane.hotfix);
        break;

      // Something turned up on the commit just written: it lights up, and
      // what it is rises off it.
      case "obstacle_spawned":
        held.push({
          caption: translate({ key: event.nameKey }),
          colour: palette.lane.obstacle,
          hold: STORY.popLong,
        });
        flashAt(palette.lane.obstacle);
        break;

      case "hack":
        flashAt(event.success ? palette.lane.feature : palette.lane.hotfix);
        break;

      case "deadline_missed":
        flashAt(palette.lane.hotfix);
        break;

      case "pr_rejected":
        if (!event.countered) flashAt(palette.lane.hotfix);
        break;

      case "roll":
        steps.push({ kind: "beat", hold: STORY.roll });
        break;

      case "pr_reviewed":
        flush();
        steps.push({ kind: "beat", hold: reviewHold ? STORY.review : STORY.boundary });
        break;

      case "ticket_restarted":
        flush();
        steps.push({ kind: "beat", hold: STORY.boundary });
        break;

      case "ambient_event":
        held.push({
          caption: translate({ key: `events.${event.eventId}.title` }),
          colour: palette.text,
          hold: STORY.popLong,
        });
        break;

      case "failure_event":
        if (event.eventId !== "merge_conflict") {
          held.push({
            caption: translate({ key: `events.${event.eventId}.title` }),
            colour: palette.lane.hotfix,
            hold: STORY.popLong,
          });
        }
        break;

      case "merge_event":
        if (event.eventId !== "merge_conflict") {
          held.push({
            caption: translate({ key: `events.${event.eventId}.title` }),
            colour: palette.lane.refactor,
            hold: STORY.popLong,
          });
          flashAt(palette.lane.refactor);
        }
        break;

      case "bug_fixed":
        held.push({ caption: "✓ bug", colour: palette.node.craft, hold: STORY.pop });
        break;

      case "sprint_ended":
      case "sprint_started":
      case "narrative_opened":
      case "turn_started":
      case "ticket_started":
      case "ticket_arrived":
      case "game_over":
        flush();
        if (event.type !== "turn_started") steps.push({ kind: "beat", hold: STORY.boundary });
        break;

      // Nothing to show on their own: their consequences are other events.
      case "obstacle_cleared":
      case "ticket_merged":
      case "ticket_cancelled":
      case "conflict_resolved":
      case "debt_refactored":
      case "rested":
      case "monitoring_warning":
      case "docs_written":
      case "rebased":
      case "debt_explosion":
      case "relic_chosen":
      case "tree_placed":
      case "month_closed":
      case "outage":
      case "upgrade_bought":
      case "skill_point_bought":
      case "hired":
      case "dev_left":
      case "dev_promoted":
      case "ticket_assigned":
      case "acquired":
      case "capacity_warning":
      case "competitor_entered":
      case "competitor_merged":
      case "competitor_bought":
      case "price_war":
      case "share_changed":
      case "narrative_answered":
      case "objective_set":
      case "objective_done":
      case "objective_failed":
      case "system_note":
      case "crunch":
        break;
    }

    // After the effect, never before: a commit is heard once it is seen.
    const sound = sfxFor(event);
    if (sound !== null) steps.push({ kind: "sfx", id: sound });
  }

  flush();
  if (away) steps.push({ kind: "look", y: null, hold: STORY.look });
  if (steps.length === 0) steps.push({ kind: "beat", hold: STORY.roll });
  return steps;
}
