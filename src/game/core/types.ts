import type {
  AmbientEventId,
  DevRank,
  EventId,
  FailureEventId,
  MergeEventId,
  ProfileId,
  RelicId,
  SkillId,
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
}

export type TicketKind = "feature" | "hotfix" | "refactor";
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

export type GameOverReason = "burnout" | "fired";

/** What can spend production's patience. The run-over screen names the last one. */
export type QualitySource = "incident" | "rejection" | "stale" | "outage" | "idle_sprint";
/** Every way the gauge moves, the one way down included. */
export type QualityChange = QualitySource | "clean_sprint";

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
}

/** A hired developer. Their tickets are found by `Ticket.assignee`. */
export interface Dev {
  id: DevId;
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
  | { kind: "game_over"; reason: GameOverReason; cause?: QualitySource };

export interface LogLine {
  /** Monotonic within a run. Append-only, so it is a stable React key. */
  seq: number;
  turn: number;
  /** Rendered as a commit subject: `feat:`, `fix:`, `chore:`… */
  kind: "feat" | "fix" | "chore" | "merge" | "revert" | "note";
  text: I18nText;
}

export interface RunState {
  version: number;
  /** Hex string. Hashed into the PRNG cursor; shown to the player as-is. */
  seed: string;
  mode: RunMode;
  profileId: ProfileId;

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
  /** Months closed this sprint, so the sprint's end can close the rest. */
  sprintMonths: number;
  /** Tickets you landed yourself this sprint. None is a sprint production notices. */
  sprintPlayerDelivered: number;

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
  | { type: "resolve_conflict"; how: "manual" | "ai" }
  | { type: "choose_relic"; relicId: RelicId };

export type PlayerActionType = PlayerAction["type"];

export type IncidentSource = "commit" | "release";

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
  /** A skill ticket sat in the backlog through its sprint: gone, the skill back in the pool. */
  | { type: "ticket_cancelled"; ticketId: TicketId; skillId: SkillId }
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
  | { type: "relic_chosen"; relicId: RelicId }
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
  | { type: "hired"; devId: DevId; rank: DevRank; source?: UpgradeId }
  /** Unpaid. The tickets are yours now. */
  | { type: "dev_left"; devId: DevId; ticketIds: TicketId[] }
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
