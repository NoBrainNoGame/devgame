import type {
  AcquisitionId,
  AmbientEventId,
  CompetitorId,
  DevRank,
  EventId,
  FailureEventId,
  MergeEventId,
  NarrativeEventId,
  NarrativeFlag,
  ObjectiveId,
  ObjectiveReward,
  ProfileId,
  RelicId,
  SkillId,
  TicketKind,
  TreeNodeId,
  UpgradeId,
} from "@/game/content";
import type { I18nText } from "@/game/core/i18n";
import type { RngState } from "@/game/core/rng";

/** `${sprint}:${serial}`. Stable for the life of the run. */
export type NodeId = string;
/** `t${serial}`. Sorted numerically, never lexically — see `ticketSerial`. */
export type TicketId = string;
/** `d${serial}`. A hired developer, for the life of the run. */
export type DevId = string;

export type RunMode = "classic" | "daily";

/**
 * The ways a commit on a ticket may be written, beyond an ordinary one.
 *
 * None of these is a fork. Choosing to write a commit as a refactor is a
 * decision about *this* commit, so it costs a turn like any other and leaves
 * the graph a chain — the shape a feature branch actually has.
 */
export const DETOUR_KINDS = ["refactor", "fix", "risky", "squash", "docs", "rebase"] as const;
export type DetourKind = (typeof DETOUR_KINDS)[number];

export type NodeKind =
  /** The repository's first commit, on `main`: what `dev` forks from. Written once. */
  | "init"
  /** Opens a sprint on `dev`: `main` merged back in. Never played. */
  | "sprint_start"
  | "commit"
  /** Redoes the commit on the ticket that cost the most debt: that debt goes. */
  | "refactor"
  /** Redoes the oldest commit the review flagged: the bug goes. */
  | "fix"
  /** More story points for a worse roll. */
  | "risky"
  /** Erases machine-written history: debt repaid, commits lost. */
  | "squash"
  /** Buys the next few machine-written commits out of their debt. */
  | "docs"
  /** Replays the ticket on top of `dev`. Cheap when clean, brutal when not. */
  | "rebase"
  /** A ticket landing on `dev`. */
  | "feature_merge"
  /** An obstacle landing back on the feature it blocked, in that feature's column. */
  | "obstacle_merge"
  /** A `fix:` commit on a ticket production forced open. */
  | "hotfix"
  /** `dev` merged into `main`: the sprint is shipped. */
  | "sprint_merge"
  /** Last node of a sprint, on `main`. Written when the sprint closes. */
  | "release";

export type CommitMode = "craft" | "ai";

export interface NodeCommit {
  mode: CommitMode;
  reviewed: boolean;
  /**
   * A machine-written conflict fix planted something nobody saw. The release
   * treats it as unread machine work, whatever the rest of the commit says.
   */
  hiddenBug?: true;
  /**
   * The review found a bug here. The ticket cannot be resubmitted until a
   * `fix` commit has taken it out.
   */
  bugged?: true;
  /**
   * What this commit cost the codebase when it landed. A refactor targets the
   * commit that cost the most and takes exactly that back.
   */
  debt?: number;
  /** Written by a hired developer rather than by you. Never `HEAD`. */
  author?: DevId;
}

/**
 * A commit that exists. Nothing is drawn or stored for one that does not: the
 * graph is written as the player plays, and this is that record.
 */
export interface MapNode {
  id: NodeId;
  sprint: number;
  kind: NodeKind;
  /** 0 is `main`, 1 is `dev`, 2 and up are the tickets' columns. */
  lane: number;
  /** Row in the graph. Strictly greater than every parent's. */
  depth: number;
  /** What this commit was built on, the way git records it. Empty on the first. */
  parents: NodeId[];
  ticketId?: TicketId;
  /** Present on a merge: the skill the ticket it landed granted. */
  skillId?: SkillId;
  commit: NodeCommit;
  /** The i18n key of its subject line, hashed from the seed: the graph's story. */
  subjectKey: string;
}

export type { TicketKind } from "@/game/content/tickets";
/** `cancelled`: a skill ticket nobody started before its sprint ended. */
export type TicketStatus = "backlog" | "open" | "merged" | "cancelled";

/**
 * A unit of work on the board. A feature until it is started, a branch once it
 * is, a merge on `dev` once its criteria hold and the player lands it.
 */
export interface Ticket {
  id: TicketId;
  kind: TicketKind;
  status: TicketStatus;
  /** Story points to fill before it can be submitted. */
  points: number;
  filled: number;
  /** Points added by rejected reviews: the bugs to fix before resubmitting. */
  rework: number;
  /** Debt its commits added, which the review counts against it. */
  debtAdded: number;
  rejections: number;
  /** The reward, paid for with extra points. */
  skillId?: SkillId;
  /** Monthly revenue it earns once shipped. Zero for a hotfix or a forced refactor. */
  /** The tier the ticket arrived at: its revenue and load are scaled by it. */
  tier: number;
  /** Users it brings to production once shipped. Zero for a hotfix or a forced refactor. */
  load: number;
  mrr: number;
  /** The developer working it, when it is not you. */
  assignee?: DevId;
  /** The sprint it arrived in, so a ticket left in the backlog can be assigned. */
  sprintArrived: number;
  /**
   * `state.devMerges` when it was opened. Every merge on `dev` since is a
   * history this ticket does not have, and the price of that shows at its own
   * merge — or is paid off by a rebase.
   */
  devMergesAtOpen: number;
  /** The column it writes in, taken when opened and handed back when merged. */
  lane?: number;
  /** Its commits, oldest first. */
  nodeIds: NodeId[];
  mergeNodeId?: NodeId;
  /** Hotfix and forced refactor: only this kind of commit fills the points. */
  mustWrite?: "hotfix" | "refactor";
  /** Came with a company bought: merged without a commit, earns, never scores. */
  origin?: "acquired";
  /**
   * The feature this ticket stands in the way of. An obstacle forks from its
   * parent's tip, lands back on it, and holds the parent's pull request until
   * it has. Its points are its own; the bugs on it are the parent's.
   */
  parentId?: TicketId;
  /** The i18n key of a feature's name, hashed from the seed. Absent on a forced ticket. */
  nameKey?: string;
  /** The sprint by whose end it must have landed, when its kind has one. */
  deadlineSprint?: number;
  /** Its deadline passed: the reward is gone, or halved. */
  late?: true;
}

export interface Player {
  /** The ticket being written. Null between tickets. */
  ticketId: TicketId | null;
  energy: number;
  energyMax: number;
  totalCommits: number;
  /** Turns finished with no energy left. Two in a row is burnout. */
  zeroEnergyStreak: number;
  /** Consecutive AI commits, for the review chain bonus. */
  aiChain: number;
  /** Pair programming rerolls once per sprint. */
  rerollUsed: boolean;
  /** Turns since the automatic review last ran. */
  turnsSinceFreeReview: number;
  /** A craft success sometimes makes the next refactor free. */
  freeRefactor: boolean;
  /** Machine-written commits still covered by a documentation commit. */
  docsCharges: number;
}

/** `caught`: a hack of the outside world went wrong with production's patience already gone. */
export type GameOverReason = "burnout" | "fired" | "caught";

/** What a hack of the outside world would buy, when it is offered at all. */
export type HackKind = "patience" | "energy" | "capacity";

/** A competitor as the market tracks it. */
export type CompetitorStatus = "waiting" | "alive" | "merged" | "bought";

export interface CompetitorState {
  /** Market power, in the run's own units: revenue plus users. */
  strength: number;
  status: CompetitorStatus;
  /** Who absorbed it, when merged into another competitor. */
  mergedInto?: CompetitorId;
}

/** The market: the run's share of it, and who else is on it. */
export interface MarketState {
  /** Percentage points added to the share by what customers remember. */
  shareBonus: number;
  /** The month a price war ends, null when there is none. */
  priceWarUntilMonth: number | null;
  competitors: Record<CompetitorId, CompetitorState>;
}

export interface ObjectiveState {
  id: ObjectiveId;
  /** What "done" means, for the ones that count. */
  target: number;
  /** Set when the sprint settled it. */
  outcome?: "done" | "failed";
}

export interface SprintCounters {
  rests: number;
  aiCommits: number;
  vipDelivered: number;
  bugsDelivered: number;
}

/** What the system comments on, once it starts commenting. */
export type SystemNote = "sprint" | "tier" | "review_policy" | "channel_closed";

/** One payday, as the finance chart draws it. */
export interface FinanceMonth {
  month: number;
  sprint: number;
  tier: number;
  money: number;
  mrr: number;
  revenue: number;
  upkeep: number;
  salaries: number;
  net: number;
  load: number;
  capacity: number;
  outage: boolean;
}

/** What can spend production's patience. The run-over screen names the last one. */
export type QualitySource =
  | "incident"
  | "rejection"
  | "stale"
  | "outage"
  | "idle_sprint"
  | "deadline"
  | "event"
  | "objective";
/** Every way the gauge moves, the ways down included. */
export type QualityChange = QualitySource | "clean_sprint" | "hack" | "client_bug";

/**
 * What happened over the whole run, counted in the rules as it happens and
 * never reconstructed from the log. The run-over screen reads it; nothing in
 * the rules does.
 */
export interface RunStats {
  incidents: number;
  outages: number;
  rejections: number;
  /** Backlog tickets a sprint had to force open. */
  staleForced: number;
  idleSprints: number;
  devsLeft: number;
  /** Revenue lost to saturated servers. */
  moneyLost: number;
  qualityBySource: Record<QualitySource, number>;
  lastQualitySource: QualitySource | null;
  /** Commits attempted and landed, by the hand that wrote them. */
  commitsTried: Record<CommitMode, number>;
  commitsLanded: Record<CommitMode, number>;
  reviews: number;
  rests: number;
  hacks: { tried: number; won: number };
  /** Answers given, keyed `eventId:choice`. */
  answers: Record<string, number>;
  /** Objectives settled, keyed by id. */
  objectives: Record<string, { done: number; failed: number }>;
  arrivedByKind: Record<TicketKind, number>;
  deliveredByPlayer: Record<TicketKind, number>;
  deliveredByTeam: number;
  deadlinesMissed: number;
  moneyPeak: number;
  /** The sprint each tier was reached in, keyed by tier. */
  tierSprint: Record<string, number>;
  hires: number;
  /** Sprint bonuses, offered and taken, keyed by id: the pick rate is the balancing signal. */
  relicsOffered: Record<string, number>;
  relicsChosen: Record<string, number>;
}

/** What a showcase run carries with it: see `ShowcaseOptions` in `run.ts`. */
export interface ShowcaseState {
  /** Tickets the board is topped up to at every sprint: enough for the team, never a pile. */
  backlog: number;
}

/** A hired developer. Their tickets are found by `Ticket.assignee`. */
export interface Dev {
  id: DevId;
  /** A first name, drawn at hiring: what the roster, the log and the refs call them. */
  name: string;
  rank: DevRank;
  /** The rank they were hired at, for the roster. */
  hiredRank: DevRank;
  /** Tickets landed, which is what promotes them. */
  delivered: number;
  hiredSprint: number;
}

export type Phase =
  /** On a ticket, or between tickets: commit, review, merge, start, switch. */
  | { kind: "choose_action" }
  /** A rebase tangled. `mode` is the commit attempted; the fix finishes it. */
  | {
      kind: "resolve_conflict";
      source: "commit";
      ticketId: TicketId;
      mode: CommitMode;
      nodeKind: NodeKind;
    }
  /** A merge tangled. Resolving it lands the ticket. */
  | { kind: "resolve_conflict"; source: "merge"; ticketId: TicketId }
  /** The review said yes. The merge waits for the player to press the button. */
  | { kind: "pr_accepted"; ticketId: TicketId }
  /** The review said no. Start the ticket over, or fix it and carry on. */
  | { kind: "ticket_rejected"; ticketId: TicketId; bugs: number; overDebt: boolean }
  | { kind: "choose_relic"; offer: RelicId[] }
  /** Something happened to the company and asks it a question. */
  | { kind: "event"; eventId: NarrativeEventId; competitorId?: CompetitorId; devId?: DevId }
  | { kind: "game_over"; reason: GameOverReason; cause?: QualitySource };

export interface LogLine {
  /** Monotonic within a run. Append-only, so it is a stable React key. */
  seq: number;
  turn: number;
  /** Rendered as a commit subject: `feat:`, `fix:`, `chore:`… `system` is the run's own voice. */
  kind: "feat" | "fix" | "chore" | "merge" | "revert" | "note" | "system";
  text: I18nText;
}

export interface RunState {
  version: number;
  /** Hex string. Hashed into the PRNG cursor; shown to the player as-is. */
  seed: string;
  mode: RunMode;
  profileId: ProfileId;
  /**
   * A run played to be looked at, not scored: the landing page's. It cannot
   * end, a developer the money does not pay stays, and the board is fed so
   * the team is never idle. Set at creation and never saved: no log of it is
   * ever replayed or submitted. Null for a run somebody plays.
   */
  showcase: ShowcaseState | null;

  rng: RngState;
  turn: number;
  sprint: number;
  /** Turns spent in this sprint. The release ships when it reaches the box. */
  sprintTurn: number;

  nodes: Record<NodeId, MapNode>;
  /** Serial for generated ids, so nothing collides across sprints. */
  nextNodeSerial: number;
  /** The next free row. Every commit written takes it, whichever column. */
  nextDepth: number;

  tickets: Record<TicketId, Ticket>;
  nextTicketSerial: number;
  /** Merges landed on `dev` this run. What a ticket compares itself against. */
  devMerges: number;
  /** Everything merged on `dev` since the last release, for the bugs it ships. */
  shipped: NodeId[];

  player: Player;

  skills: SkillId[];
  /** Skills this account has unlocked; tickets draw their rewards from it. */
  unlockedSkills: SkillId[];
  /**
   * Skill points the account's level granted when the run started. Part of
   * the state so the save reads it back rather than recomputing it from a
   * profile that may have levelled since.
   */
  startingSkillPoints: number;
  relics: RelicId[];
  /** Last sprint's bonus offer, held back from the next draw. */
  lastRelicOffer: RelicId[];
  /** What a boost left pending: spent by the next purchase, hire, sprint or paydays. */
  boosts: PendingBoosts;
  tree: Record<TreeNodeId, number>;
  skillPoints: number;
  /** Skill points bought outright, which sets the price of the next. */
  skillPointsBought: number;

  money: number;
  /** Everything ever collected, for the score screen. */
  moneyEarned: number;
  upgrades: Record<UpgradeId, number>;
  devs: Dev[];
  nextDevSerial: number;
  /** Months closed since the run started. */
  months: number;
  /** The order of magnitude reached, and never lost. */
  tier: number;
  /** Companies bought, each once. */
  acquisitions: AcquisitionId[];
  /** The last capacity level reported, so a warning is said once per rise. */
  capacityAlert: CapacityLevel;
  /** The last paydays, newest last, capped: what the chart draws. */
  finance: FinanceMonth[];
  /** The sprint of the last hack attempt: one a sprint, whatever it bought. */
  hackSprint: number | null;
  market: MarketState;
  /** The narrative's bookkeeping: when the last event opened, which fired once. */
  narrative: { lastTurn: number; fired: NarrativeEventId[] };
  /** What the answers to the system's questions left behind. */
  flags: Record<NarrativeFlag, boolean>;
  /** Months closed this sprint, so the sprint's end can close the rest. */
  sprintMonths: number;
  /** Tickets you landed yourself this sprint. None is a sprint production notices. */
  sprintPlayerDelivered: number;
  /** What this sprint asks, how far along, and how it ended. */
  objective: ObjectiveState | null;
  /** Counters the objectives read, reset every sprint. */
  sprintCounters: SprintCounters;

  /** 0 to 100. Only shown exactly when something reveals it. */
  debt: number;
  /** Redrawn whenever debt moves, so the displayed range is stable in between. */
  debtNoise: number;

  /**
   * Set when monitoring caught a production bug before it shipped. The next
   * one gets through, which is what makes the warning a reprieve rather than
   * immunity.
   */
  monitoringWarning: boolean;
  /** How close production is to losing patience. Full is the sack. */
  quality: number;
  /** Incidents this sprint, so a clean sprint can be told apart. */
  sprintIncidents: number;
  /** A backlog ticket was forced open this sprint: it does not count as clean. */
  sprintForced: boolean;
  stats: RunStats;

  xpEarned: number;
  pointsDelivered: number;
  ticketsDelivered: number;

  phase: Phase;
  log: LogLine[];
  nextLogSeq: number;
}

export type PlayerAction =
  /** Backlog to branch. Free. */
  | { type: "start"; ticketId: TicketId }
  /** Switch to another open ticket. Free. */
  | { type: "checkout"; ticketId: TicketId }
  /** `kind` writes the commit as a detour instead of plainly. */
  | { type: "commit"; mode: CommitMode; kind?: DetourKind }
  | { type: "review" }
  /** A turn spent not coding. Energy back, minus what the open board costs. */
  | { type: "rest" }
  /** Open the pull request: the review decides whether the ticket lands. */
  | { type: "submit" }
  /** Lands an accepted pull request. Costs the turn the review did not. */
  | { type: "merge" }
  /** After a rejection: throw the ticket's commits away and start again. */
  | { type: "restart" }
  /** After a rejection: keep the commits and fix what was found. */
  | { type: "resume" }
  | { type: "tree"; id: TreeNodeId }
  /** Shop purchases and hiring. Free in time, paid in money. */
  | { type: "buy"; id: UpgradeId }
  | { type: "buy_point" }
  | { type: "hire"; rank: DevRank }
  /** Buy a company: its team, its features, its debt. Free in time. */
  | { type: "acquire"; id: AcquisitionId }
  /** Hack the outside world. Offered only in a very tight spot; a coin flip. */
  | { type: "hack" }
  /** The answer to an event. Free: the question is what costs. */
  | { type: "answer"; eventId: NarrativeEventId; choice: string }
  | { type: "resolve_conflict"; how: "manual" | "ai" }
  | { type: "choose_relic"; relicId: RelicId };

export type PlayerActionType = PlayerAction["type"];

export type IncidentSource = "commit" | "release" | "acquisition" | "hack";

/** Where a developer came from, when not hired one by one. */
export type DevSource = { site: UpgradeId } | { acquisition: AcquisitionId } | { relic: RelicId };

export interface PendingBoosts {
  /** Percent off the next upgrade bought. */
  shopDiscountPct: number;
  /** The next hire costs nothing. */
  freeHire: boolean;
  /** Turns added to the sprint under way. */
  extraTurns: number;
  /** Paydays left with the revenue boosted. */
  revenueBoostMonths: number;
}

/** How close production is to saturating, as reported to the board. */
export type CapacityLevel = "ok" | "warning" | "saturated";

export type GameEvent =
  | { type: "turn_started"; turn: number }
  | {
      type: "roll";
      action: "commit" | "conflict";
      chancePct: number;
      rolled: number;
      success: boolean;
      rerolled: boolean;
    }
  | { type: "node_done"; nodeId: NodeId; mode: CommitMode; kind: NodeKind }
  /** Story points filled on a ticket. */
  | { type: "points"; ticketId: TicketId; delta: number; value: number; max: number }
  | { type: "energy"; delta: number; value: number; reason: string }
  | { type: "rested"; energy: number }
  | { type: "debt"; delta: number; value: number }
  | { type: "ticket_arrived"; ticketId: TicketId }
  /** `forced` when the board assigned it rather than the player. */
  | { type: "ticket_started"; ticketId: TicketId; kind: TicketKind; forced: boolean }
  | { type: "checkout"; ticketId: TicketId }
  /** The pull request was read. Accepted, it merges in the same turn. */
  | {
      type: "pr_reviewed";
      ticketId: TicketId;
      accepted: boolean;
      bugs: number;
      unread: number;
      debt: number;
      maxDebt: number;
      /** Rework points added, when rejected. */
      rework: number;
    }
  | { type: "ticket_restarted"; ticketId: TicketId; nodeIds: NodeId[] }
  /** A commit on a feature turned something up: a sub-ticket, open and in hand, forked off it. */
  | {
      type: "obstacle_spawned";
      ticketId: TicketId;
      parentId: TicketId;
      nodeId: NodeId;
      /** The obstacle's name key, so the log can say what turned up. */
      nameKey: string;
    }
  /** The obstacle landed back on its feature. `devId` when a hired developer did. */
  | {
      type: "obstacle_cleared";
      ticketId: TicketId;
      parentId: TicketId;
      nodeId: NodeId;
      devId?: DevId;
    }
  /** A skill ticket sat in the backlog through its sprint: gone, the skill back in the pool. */
  | { type: "ticket_cancelled"; ticketId: TicketId; skillId?: SkillId }
  /** A fix took the bug out of a commit the review had flagged. */
  | { type: "bug_fixed"; ticketId: TicketId; nodeId: NodeId }
  /** A refactor redid a commit and took back the debt it had cost. */
  | { type: "debt_refactored"; ticketId: TicketId; nodeId: NodeId; amount: number }
  /** `devId` when a hired developer landed it. */
  | { type: "ticket_merged"; ticketId: TicketId; nodeId: NodeId; skillId?: SkillId; devId?: DevId }
  | { type: "skill_gained"; skillId: SkillId }
  | { type: "conflict"; ticketId: TicketId }
  | { type: "conflict_resolved"; how: "manual" | "ai"; hiddenBug: boolean }
  | { type: "pr_rejected"; countered: boolean }
  | { type: "debt_explosion"; ticketId: TicketId }
  | { type: "failure_event"; eventId: FailureEventId }
  /** Something happened as the ticket landed. A conflict follows as its own event. */
  | { type: "merge_event"; eventId: MergeEventId }
  | { type: "monitoring_warning" }
  | { type: "ambient_event"; eventId: AmbientEventId }
  | { type: "reviewed"; nodeIds: NodeId[]; debtDelta: number; chain: boolean; free: boolean }
  | { type: "squashed"; nodeIds: NodeId[]; debtDelta: number; commitsLost: number }
  | { type: "docs_written"; charges: number }
  | { type: "docs_used"; nodeId: NodeId; remaining: number }
  | { type: "rebased"; ticketId: TicketId }
  /** Production broke. `ticketId` is the hotfix it opened. */
  | { type: "incident"; source: IncidentSource; nodeId: NodeId; ticketId: TicketId }
  | { type: "quality"; delta: number; value: number; max: number; source: QualityChange }
  | { type: "sprint_ended"; sprint: number; offer: RelicId[] }
  | { type: "sprint_started"; sprint: number }
  | { type: "relic_chosen"; relicId: RelicId; kind: "boost" | "keep" }
  | { type: "tree_placed"; id: TreeNodeId; level: number }
  | { type: "skill_points"; delta: number; value: number }
  | { type: "money"; delta: number; value: number; reason: string }
  /** Payday. `salaries` is what was actually paid. */
  | {
      type: "month_closed";
      month: number;
      revenue: number;
      lost: number;
      upkeep: number;
      salaries: number;
      money: number;
    }
  /** The servers saturated this month. */
  | { type: "outage"; load: number; capacity: number; overPct: number }
  | { type: "tier_reached"; tier: number }
  | { type: "upgrade_bought"; id: UpgradeId; level: number }
  | { type: "skill_point_bought"; price: number }
  | { type: "hired"; devId: DevId; rank: DevRank; source?: DevSource }
  | { type: "acquired"; id: AcquisitionId; devIds: DevId[]; ticketIds: TicketId[] }
  | { type: "hack"; kind: HackKind; chancePct: number; success: boolean }
  /** A dated ticket did not land in time: cancelled if untouched, worth less otherwise. */
  | { type: "deadline_missed"; ticketId: TicketId; kind: TicketKind; cancelled: boolean }
  | { type: "competitor_entered"; id: CompetitorId }
  | { type: "competitor_merged"; id: CompetitorId; into: CompetitorId }
  /** The strongest competitor left, bought with a company. */
  | { type: "competitor_bought"; id: CompetitorId }
  | { type: "price_war"; untilMonth: number }
  /** Customers remembered something: the share moved by these points. */
  | { type: "share_changed"; delta: number; share: number }
  | {
      type: "narrative_opened";
      eventId: NarrativeEventId;
      competitorId?: CompetitorId;
      devId?: DevId;
    }
  | { type: "narrative_answered"; eventId: NarrativeEventId; choice: string }
  | { type: "objective_set"; id: ObjectiveId; target: number }
  | { type: "objective_done"; id: ObjectiveId; reward: ObjectiveReward }
  | { type: "objective_failed"; id: ObjectiveId }
  /** A line from the system, at the tiers where it has a voice: `system.t<tier>.<note>`. */
  | { type: "system_note"; tier: number; note: SystemNote }
  /** Production is about to saturate, or has. Emitted once per rise of level. */
  | {
      type: "capacity_warning";
      level: Exclude<CapacityLevel, "ok">;
      load: number;
      capacity: number;
      projected: number;
      advice?: { id: UpgradeId; cost: number };
    }
  /** Unpaid, or written out. The tickets are yours now. The name, because the roster has forgotten it. */
  | { type: "dev_left"; devId: DevId; name: string; ticketIds: TicketId[] }
  | { type: "dev_promoted"; devId: DevId; rank: DevRank }
  /** A developer picked a ticket up from the backlog. */
  | { type: "ticket_assigned"; ticketId: TicketId; devId: DevId }
  | { type: "crunch"; active: boolean }
  | { type: "game_over"; reason: GameOverReason; cause?: QualitySource; score: number };

export interface ApplyResult {
  state: RunState;
  events: GameEvent[];
}

/** What the HUD shows before the player commits to an action. */
export interface ActionPreview {
  action: PlayerAction;
  energyCost: number;
  /** Absent for actions that cannot fail. */
  successPct?: number;
  /** Story points filled on success, as a range. */
  points?: [number, number];
  /** Debt added on success, as a range. */
  debtDelta?: [number, number];
  /** Whether taking this action ends the turn. */
  consumesTurn: boolean;
  /** Why the numbers are what they are: "Crunch −15", "CI ×2 +10"… */
  notes: I18nText[];
  /** Set when the action is offered but not currently legal. */
  blocked?: I18nText;
}

export class InvalidActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidActionError";
  }
}

export type { AmbientEventId, EventId, FailureEventId, I18nText, MergeEventId, RngState };
