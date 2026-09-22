import type { RevealSnapshot } from "@/game/bridge/reveal";
import type { I18nText } from "@/game/core/i18n";
import { headOf } from "@/game/core/map/graph";
import { MAIN_LANE } from "@/game/core/map/layout";
import type { GameEvent, NodeId, RunState } from "@/game/core/types";
import { nodeX, nodeY } from "@/game/render/coords";
import { THEME } from "@/game/render/theme";

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

export type Step =
  | { kind: "reveal"; nodeId: NodeId; at: Point; asHead: boolean; hold: number }
  | { kind: "look"; y: number | null; hold: number }
  | { kind: "pop"; anchor: NodeId; at: Point; caption: string; colour: number; hold: number }
  | { kind: "flash"; anchor: NodeId; at: Point; colour: number; hold: number }
  | { kind: "beat"; hold: number };

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
}

export function planBatch(
  events: readonly GameEvent[],
  state: RunState,
  shown: RevealSnapshot,
  translate: (text: I18nText) => string,
): Step[] {
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

  const signed = (delta: number): string => `${delta > 0 ? "+" : ""}${delta}`;

  for (const event of events) {
    switch (event.type) {
      case "node_done": {
        const at = positionOf(event.nodeId);
        if (at === null) break;
        const node = state.nodes[event.nodeId];
        // A release is not somewhere you stand: `main` is shipped, not written.
        const asHead = node !== undefined && node.lane !== MAIN_LANE;
        revealed.add(event.nodeId);
        cursor = event.nodeId;
        away = false;
        steps.push({ kind: "reveal", nodeId: event.nodeId, at, asHead, hold: STORY.reveal });
        flush();
        break;
      }

      case "energy":
        held.push({ caption: `${signed(event.delta)}⚡`, colour: THEME.energy, hold: STORY.pop });
        break;

      case "debt":
        held.push({ caption: `${signed(event.delta)} dette`, colour: THEME.debt, hold: STORY.pop });
        break;

      case "points":
        held.push({
          caption: `${signed(event.delta)} pts`,
          colour: THEME.lane.feature,
          hold: STORY.pop,
        });
        break;

      case "quality":
        held.push({
          caption: `${signed(event.delta)} prod`,
          colour: THEME.lane.hotfix,
          hold: STORY.pop,
        });
        break;

      case "skill_gained":
        held.push({
          caption: translate({ key: `skills.${event.skillId}.name` }),
          colour: THEME.lane.feature,
          hold: STORY.popLong,
        });
        break;

      case "reviewed":
        if (event.nodeIds.length > 0) {
          held.push({
            caption: `✓ ${event.nodeIds.length}`,
            colour: THEME.node.craft,
            hold: STORY.pop,
          });
        }
        break;

      case "squashed":
        held.push({
          caption: `⊟ ${event.nodeIds.length}`,
          colour: THEME.lane.refactor,
          hold: STORY.pop,
        });
        break;

      case "docs_used":
        held.push({ caption: "¶", colour: THEME.lane.refactor, hold: STORY.pop });
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
        flashAt(THEME.lane.hotfix);
        break;

      case "pr_rejected":
        if (!event.countered) flashAt(THEME.lane.hotfix);
        break;

      case "roll":
        steps.push({ kind: "beat", hold: STORY.roll });
        break;

      case "pr_reviewed":
        flush();
        steps.push({ kind: "beat", hold: STORY.review });
        break;

      case "ticket_restarted":
        flush();
        steps.push({ kind: "beat", hold: STORY.boundary });
        break;

      case "merge_event":
        if (event.eventId !== "merge_conflict") flashAt(THEME.lane.refactor);
        break;

      case "sprint_ended":
      case "sprint_started":
      case "turn_started":
      case "ticket_started":
      case "ticket_arrived":
      case "game_over":
        flush();
        if (event.type !== "turn_started") steps.push({ kind: "beat", hold: STORY.boundary });
        break;

      // Nothing to show on their own: their consequences are other events.
      case "ticket_merged":
      case "conflict_resolved":
      case "failure_event":
      case "monitoring_warning":
      case "ambient_event":
      case "docs_written":
      case "rebased":
      case "debt_explosion":
      case "relic_chosen":
      case "devops_placed":
      case "devops_points":
      case "crunch":
        break;
    }
  }

  flush();
  if (away) steps.push({ kind: "look", y: null, hold: STORY.look });
  if (steps.length === 0) steps.push({ kind: "beat", hold: STORY.roll });
  return steps;
}
