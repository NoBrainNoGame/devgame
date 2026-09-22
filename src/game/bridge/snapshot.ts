import type { DevopsId, ProfileId, RelicId, SkillId } from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { headOf } from "@/game/core/map/graph";
import { getAvailableActions } from "@/game/core/rules/actions";
import {
  type DebtView,
  debtView,
  energyMax,
  gatherEffects,
  isCrunch,
  reviewedRatio,
  wipExtra,
} from "@/game/core/rules/modifiers";
import { previewAll } from "@/game/core/rules/preview";
import {
  behindOf,
  buggedOn,
  currentTicket,
  isReady,
  sortedTickets,
  unreadAiOn,
} from "@/game/core/rules/tickets";
import { computeScore } from "@/game/core/score";
import type {
  ActionPreview,
  MapNode,
  NodeId,
  Phase,
  PlayerAction,
  RunMode,
  RunState,
  Ticket,
  TicketId,
} from "@/game/core/types";

/**
 * The read-only view React renders from.
 *
 * It exists so the HUD never touches `RunState`: the state is a mutable game
 * board with a PRNG cursor in it, and a component that reaches into it will
 * eventually read something it should not be able to see — the exact debt, for
 * instance, which is the one number the game deliberately blurs.
 */

export interface PlayerView {
  /** The ticket being written, or null between tickets. */
  ticketId: TicketId | null;
  /** `HEAD`: the last commit actually written. This is where the graph draws you. */
  headId: NodeId;
  energy: number;
  energyMax: number;
  totalCommits: number;
  crunch: boolean;
  /** Open tickets beyond the first. Each one taxes every commit. */
  wip: number;
  reviewedRatio: number;
  /** Unread machine-written commits on the ticket in hand. */
  unreviewed: number;
}

/**
 * A ticket as the panel shows it: what it asks for, how far it is, and
 * whether it can land. The node ids are there for the ticket's own dialog,
 * which lists its commits from `nodes`.
 */
export interface TicketView {
  id: TicketId;
  kind: Ticket["kind"];
  status: Ticket["status"];
  points: number;
  filled: number;
  /** Points added by rejected reviews, part of `points`. */
  rework: number;
  rejections: number;
  /** Machine-written commits on it nobody has read: what a review may catch. */
  unread: number;
  /** Commits the review flagged. A fix each, before it can go back. */
  bugs: number;
  skillId?: SkillId;
  lane?: number;
  /** Merges landed on `dev` since it was opened. Its merge pays for each. */
  behind: number;
  ready: boolean;
  commits: number;
  nodeIds: NodeId[];
  sprintArrived: number;
  /** Debt this ticket's commits cost, repayments not credited. */
  debtAdded: number;
  mustWrite?: Ticket["mustWrite"];
}

export interface RunSnapshot {
  seed: string;
  mode: RunMode;
  profileId: ProfileId;

  turn: number;
  sprint: number;
  /** Turns spent in this sprint, out of the box. */
  sprintTurn: number;
  sprintTurns: number;
  score: number;
  xpEarned: number;
  ticketsDelivered: number;
  pointsDelivered: number;
  /** Production's patience, 0 to `qualityMax`. Full is the sack. */
  quality: number;
  qualityMax: number;

  phase: Phase;
  actions: PlayerAction[];
  /** Keyed by `actionKey`, so a button can look up its own numbers. */
  previews: Record<string, ActionPreview>;

  player: PlayerView;
  debt: DebtView;

  skills: SkillId[];
  relics: RelicId[];
  devops: Record<DevopsId, number>;
  devopsPoints: number;

  /** Enough of each node for the graph and a tooltip. */
  nodes: Record<
    NodeId,
    Pick<MapNode, "id" | "kind" | "lane" | "depth" | "parents" | "skillId" | "commit" | "ticketId">
  >;

  /** The board, oldest ticket first. */
  tickets: TicketView[];
}

export function toSnapshot(state: RunState): RunSnapshot {
  const effects = gatherEffects(state);
  const actions = getAvailableActions(state);
  const current = currentTicket(state);

  const nodes: RunSnapshot["nodes"] = {};
  for (const id of Object.keys(state.nodes).sort()) {
    const node = state.nodes[id];
    if (node === undefined) continue;
    nodes[id] = {
      id: node.id,
      kind: node.kind,
      lane: node.lane,
      depth: node.depth,
      parents: [...node.parents],
      ...(node.skillId === undefined ? {} : { skillId: node.skillId }),
      commit: { ...node.commit },
      ...(node.ticketId === undefined ? {} : { ticketId: node.ticketId }),
    };
  }

  const tickets: TicketView[] = sortedTickets(state).map((ticket) => ({
    id: ticket.id,
    kind: ticket.kind,
    status: ticket.status,
    points: ticket.points,
    filled: ticket.filled,
    rework: ticket.rework,
    nodeIds: [...ticket.nodeIds],
    sprintArrived: ticket.sprintArrived,
    debtAdded: ticket.debtAdded,
    rejections: ticket.rejections,
    unread: unreadAiOn(state, ticket).length,
    bugs: buggedOn(state, ticket).length,
    ...(ticket.skillId === undefined ? {} : { skillId: ticket.skillId }),
    ...(ticket.lane === undefined ? {} : { lane: ticket.lane }),
    behind: behindOf(state, ticket),
    ready: ticket.status === "open" && isReady(state, ticket),
    commits: ticket.nodeIds.length,
    ...(ticket.mustWrite === undefined ? {} : { mustWrite: ticket.mustWrite }),
  }));

  return {
    seed: state.seed,
    mode: state.mode,
    profileId: state.profileId,

    turn: state.turn,
    sprint: state.sprint,
    sprintTurn: state.sprintTurn,
    sprintTurns: BALANCE.sprint.turns,
    score: computeScore(state),
    xpEarned: state.xpEarned,
    ticketsDelivered: state.ticketsDelivered,
    pointsDelivered: state.pointsDelivered,
    quality: state.quality,
    qualityMax: BALANCE.quality.max,

    phase: state.phase,
    actions,
    previews: previewAll(state, actions),

    player: {
      ticketId: state.player.ticketId,
      headId: headOf(state).id,
      energy: state.player.energy,
      energyMax: energyMax(state, effects),
      totalCommits: state.player.totalCommits,
      crunch: isCrunch(state),
      wip: wipExtra(state),
      reviewedRatio: reviewedRatio(state),
      unreviewed: current === null ? 0 : unreadAiOn(state, current).length,
    },

    debt: debtView(state, effects),

    skills: [...state.skills],
    relics: [...state.relics],
    devops: { ...state.devops },
    devopsPoints: state.devopsPoints,

    nodes,
    tickets,
  };
}
