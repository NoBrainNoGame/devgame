import type {
  AcquisitionId,
  CompetitorId,
  DevRank,
  ObjectiveId,
  ProfileId,
  RelicId,
  SkillId,
  TreeNodeId,
  UpgradeId,
} from "@/game/content";
import { COMPETITOR_IDS, DEV_RANK, DEV_RANKS, devColourIndex } from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { headOf } from "@/game/core/map/graph";
import { getAvailableActions } from "@/game/core/rules/actions";
import { type CapacityAdvice, capacityAdvice, capacityStatus } from "@/game/core/rules/capacity";
import { monthlyReport, paydayIn, projectedLoadOf } from "@/game/core/rules/economy";
import { hackOffer } from "@/game/core/rules/hack";
import { competitorsAlive, powerOf, priceWarMonthsLeft } from "@/game/core/rules/market";
import {
  type DebtView,
  debtView,
  energyMax,
  gatherEffects,
  isCrunch,
  reviewedRatio,
  wipExtra,
} from "@/game/core/rules/modifiers";
import { objectiveMet, objectiveProgress } from "@/game/core/rules/objectives";
import { previewAll } from "@/game/core/rules/preview";
import { qualityMax } from "@/game/core/rules/quality";
import { sprintTurns } from "@/game/core/rules/relics";
import { skillPointPrice } from "@/game/core/rules/shop";
import { devCapacity, hireCostOf, maxSeats, ticketsOf } from "@/game/core/rules/team";
import {
  behindOf,
  buggedOn,
  currentTicket,
  FILLING_DETOURS,
  isReady,
  obstaclesOf,
  sortedTickets,
  unreadAiOn,
  waitsOnlyForObstacle,
} from "@/game/core/rules/tickets";
import { austerityOf } from "@/game/core/rules/tier";
import { computeScore } from "@/game/core/score";
import type {
  ActionPreview,
  CapacityLevel,
  CompetitorStatus,
  DevId,
  FinanceMonth,
  HackKind,
  MapNode,
  NodeId,
  PendingBoosts,
  Phase,
  PlayerAction,
  RunMode,
  RunState,
  RunStats,
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
  /** Monthly revenue once shipped. */
  mrr: number;
  /** The developer working it, when it is not you. */
  assignee?: DevId;
  /** The feature this obstacle stands on. */
  parentId?: TicketId;
  /** The obstacles still standing on it: it cannot go to review while one is. */
  blockedBy: TicketId[];
  /** Full and clean, held back by its obstacle alone: nothing left to write on it. */
  waitingOnObstacle: boolean;
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
  origin?: Ticket["origin"];
  /** The feature's name, as an i18n key; absent on a forced ticket. */
  nameKey?: string;
  /** The sprint by whose end it must land; absent when it has no deadline, or missed it. */
  deadlineSprint?: number;
  late?: true;
}

/** A hired developer as the roster shows them. */
export interface DevView {
  id: DevId;
  name: string;
  /** Which of the team's colours they wear: `--color-dev-<colour>`. */
  colour: number;
  rank: DevRank;
  /** Tickets they can hold at once, bonuses included. */
  capacity: number;
  ticketIds: TicketId[];
  delivered: number;
  /** Tickets to deliver before the next rank; null at the top. */
  promotionIn: number | null;
  salary: number;
}

/** A competitor as the market tab shows it. */
export interface CompetitorView {
  id: CompetitorId;
  status: CompetitorStatus;
  strength: number;
  /** Its share of the whole market, 0 to 1; zero unless alive. */
  share: number;
  mergedInto?: CompetitorId;
}

/** The finances, as the company screen and the resource bar show them. */
export interface EconomyView {
  /** The order of magnitude reached: what the unit of account and the shop follow. */
  tier: number;
  money: number;
  moneyEarned: number;
  mrr: number;
  load: number;
  capacity: number;
  /** How far over capacity, in percent of it; zero when served. */
  overPct: number;
  revenue: number;
  upkeep: number;
  salaries: number;
  net: number;
  month: number;
  /** Turns until the next payday. */
  paydayIn: number;
  /** What the next skill point costs in the shop. */
  skillPointPrice: number;
  /** Lifetime earnings that reach the next tier, null at the last one. */
  nextTierAt: number | null;
  /** Where the servers stand against what is about to land. */
  alert: CapacityLevel;
  /** Users once the tickets about to land have landed. */
  projectedLoad: number;
  /** The rung the game would buy, when production needs one; null when served. */
  advice: CapacityAdvice | null;
  /** Companies bought so far. */
  acquisitions: AcquisitionId[];
  /** The last paydays, oldest first: what the chart draws. */
  history: FinanceMonth[];
  /** The run's share of the market, 0 to 1, and what it does to the revenue. */
  share: number;
  marketMultiplier: number;
  /** Months of price war left, zero when none. */
  priceWarMonths: number;
  /** Developers on the roster, and the seats there are for them. */
  seats: { used: number; max: number };
  /** What each rank costs to hire today, discounts included. */
  hireCosts: Record<DevRank, number>;
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
  /** What the run went through, for the screen that ends it. */
  stats: RunStats;

  phase: Phase;
  actions: PlayerAction[];
  /** Keyed by `actionKey`, so a button can look up its own numbers. */
  previews: Record<string, ActionPreview>;

  player: PlayerView;
  debt: DebtView;

  skills: SkillId[];
  relics: RelicId[];
  /** What a boost left pending, for the shop, the roster and the sprint bar to say so. */
  boosts: PendingBoosts;
  tree: Record<TreeNodeId, number>;
  skillPoints: number;
  upgrades: Record<UpgradeId, number>;
  economy: EconomyView;
  /** The roster, in hiring order. */
  devs: DevView[];
  /** The supervisor's level, 0 when none: how much the idle clock may do on its own. */
  autopilot: number;
  /** How fast the idle clock may run: 0 = ×1, 1 = ×10, 2 = ×100. */
  idleSpeedTier: number;
  /** The hack on offer, when the run is in a tight enough spot; null otherwise. */
  hack: HackKind | null;
  /** The look the run has reached: tier plus a log fraction, never going back. */
  austerity: number;
  /** The other companies, in the order they were written. */
  competitors: CompetitorView[];
  /** What the answers to the system's questions left behind. */
  flags: RunState["flags"];
  /** What this sprint asks, and how far along it is. */
  objective: {
    id: ObjectiveId;
    target: number;
    progress: number;
    met: boolean;
    outcome?: "done" | "failed";
  } | null;

  /** Enough of each node for the graph and a tooltip. */
  nodes: Record<
    NodeId,
    Pick<
      MapNode,
      | "id"
      | "kind"
      | "lane"
      | "depth"
      | "parents"
      | "skillId"
      | "commit"
      | "ticketId"
      | "subjectKey"
    >
  >;

  /** The board, oldest ticket first. */
  tickets: TicketView[];
}

/**
 * The moves the player is offered: the legal ones, less the commits that
 * would fill points on a ticket that is full and waits only for its
 * obstacle. The rules keep those legal so every recorded run replays as it
 * was played; nothing offers them any more — neither the HUD nor the idle
 * clock, which both read this list.
 */
function offeredActions(state: RunState): PlayerAction[] {
  const actions = getAvailableActions(state);
  const current = currentTicket(state);
  if (current === null || !waitsOnlyForObstacle(state, current)) return actions;
  return actions.filter(
    (action) =>
      action.type !== "commit" || (action.kind !== undefined && !FILLING_DETOURS.has(action.kind)),
  );
}

export function toSnapshot(state: RunState): RunSnapshot {
  const effects = gatherEffects(state);
  const actions = offeredActions(state);
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
      subjectKey: node.subjectKey,
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
    mrr: ticket.mrr,
    ...(ticket.assignee === undefined ? {} : { assignee: ticket.assignee }),
    ...(ticket.parentId === undefined ? {} : { parentId: ticket.parentId }),
    blockedBy: obstaclesOf(state, ticket).map((obstacle) => obstacle.id),
    waitingOnObstacle: ticket.status === "open" && waitsOnlyForObstacle(state, ticket),
    ...(ticket.lane === undefined ? {} : { lane: ticket.lane }),
    behind: behindOf(state, ticket),
    ready: ticket.status === "open" && isReady(state, ticket),
    commits: ticket.nodeIds.length,
    ...(ticket.mustWrite === undefined ? {} : { mustWrite: ticket.mustWrite }),
    ...(ticket.origin === undefined ? {} : { origin: ticket.origin }),
    ...(ticket.nameKey === undefined ? {} : { nameKey: ticket.nameKey }),
    ...(ticket.deadlineSprint === undefined ? {} : { deadlineSprint: ticket.deadlineSprint }),
    ...(ticket.late === undefined ? {} : { late: ticket.late }),
  }));

  const report = monthlyReport(state, effects);
  const alert = capacityStatus(state, effects);
  const projected = projectedLoadOf(state);
  const devs: DevView[] = state.devs.map((dev) => ({
    id: dev.id,
    name: dev.name,
    colour: devColourIndex(dev.id),
    rank: dev.rank,
    capacity: devCapacity(dev, effects),
    ticketIds: ticketsOf(state, dev.id).map((ticket) => ticket.id),
    delivered: dev.delivered,
    promotionIn:
      dev.rank === "senior"
        ? null
        : BALANCE.team.promoteEvery - (dev.delivered % BALANCE.team.promoteEvery),
    salary: DEV_RANK[dev.rank].salary,
  }));

  return {
    seed: state.seed,
    mode: state.mode,
    profileId: state.profileId,

    turn: state.turn,
    sprint: state.sprint,
    sprintTurn: state.sprintTurn,
    sprintTurns: sprintTurns(state),
    score: computeScore(state),
    xpEarned: state.xpEarned,
    ticketsDelivered: state.ticketsDelivered,
    pointsDelivered: state.pointsDelivered,
    quality: state.quality,
    qualityMax: qualityMax(effects),
    stats: { ...state.stats, qualityBySource: { ...state.stats.qualityBySource } },

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
    boosts: { ...state.boosts },
    tree: { ...state.tree },
    skillPoints: state.skillPoints,
    upgrades: { ...state.upgrades },
    economy: {
      tier: state.tier,
      money: state.money,
      moneyEarned: state.moneyEarned,
      mrr: report.mrr,
      load: report.load,
      capacity: report.capacity,
      overPct: report.overPct,
      revenue: report.revenue,
      upkeep: report.upkeep,
      salaries: report.salaries,
      net: report.net,
      month: state.months,
      paydayIn: paydayIn(state),
      skillPointPrice: skillPointPrice(state),
      nextTierAt:
        state.tier >= BALANCE.economy.tier.last
          ? null
          : BALANCE.economy.tier.first * BALANCE.economy.tier.growth ** state.tier,
      seats: { used: state.devs.length, max: maxSeats(effects) },
      alert,
      projectedLoad: projected,
      advice:
        alert === "ok"
          ? null
          : (capacityAdvice(state, effects, projected - report.capacity) ?? null),
      acquisitions: [...state.acquisitions],
      history: state.finance.map((month) => ({ ...month })),
      share: report.share,
      marketMultiplier: report.multiplier,
      priceWarMonths: priceWarMonthsLeft(state),
      hireCosts: Object.fromEntries(
        DEV_RANKS.map((rank) => [rank, hireCostOf(state, effects, rank)]),
      ) as Record<DevRank, number>,
    },
    devs,
    autopilot: effects.autopilot,
    idleSpeedTier: effects.idleSpeedTier,
    hack: hackOffer(state, effects),
    austerity: austerityOf(state.moneyEarned),
    flags: { ...state.flags },
    objective:
      state.objective === null
        ? null
        : {
            id: state.objective.id,
            target: state.objective.target,
            progress: objectiveProgress(state),
            met: objectiveMet(state),
            ...(state.objective.outcome === undefined ? {} : { outcome: state.objective.outcome }),
          },
    competitors: COMPETITOR_IDS.map((id) => ({
      id,
      status: state.market.competitors[id].status,
      strength: state.market.competitors[id].strength,
      // Its own share of the whole market, the run included: what a card shows.
      share:
        state.market.competitors[id].status === "alive"
          ? state.market.competitors[id].strength /
            Math.max(
              1,
              powerOf(report.mrr, report.load) +
                competitorsAlive(state).reduce(
                  (sum, other) => sum + state.market.competitors[other].strength,
                  0,
                ),
            )
          : 0,
      ...(state.market.competitors[id].mergedInto === undefined
        ? {}
        : { mergedInto: state.market.competitors[id].mergedInto }),
    })),

    nodes,
    tickets,
  };
}
