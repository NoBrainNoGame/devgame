import type {
  AmbientEventId,
  DevopsId,
  EventId,
  FailureEventId,
  ProfileId,
  RelicId,
  SkillId,
} from "@/game/content";
import type { I18nText } from "@/game/core/i18n";
import type { RngState } from "@/game/core/rng";

/** `${sprint}:${index}`. Stable for the life of the run. */
export type NodeId = string;
export type BranchId = string;

export type RunMode = "classic" | "daily";

/**
 * The ways a commit on a branch may be written, beyond an ordinary one.
 *
 * None of these is a fork. Choosing to write a commit as a refactor is a
 * decision about *this* commit, so it costs a turn like any other and leaves
 * the graph a chain — the shape a feature branch actually has.
 */
export type DetourKind = "refactor" | "risky" | "chore" | "squash" | "docs" | "rebase";

export type NodeKind =
  /** Opens a sprint on `dev`: `main` merged back in. Never played. */
  | "sprint_start"
  | "commit"
  /** Repays debt. */
  | "refactor"
  /** Jumps further for a worse roll. */
  | "risky"
  /** Draws an ambient event. */
  | "chore"
  /** Erases machine-written history: debt repaid, commits lost. */
  | "squash"
  /** Buys the next few machine-written commits out of their debt. */
  | "docs"
  /** Replays the branch on top of you. Cheap when clean, brutal when not. */
  | "rebase"
  /** A node a feature branch leaves from. */
  | "fork"
  | "feature"
  /** A feature landing: on `dev`, or in its parent's column for a sub-feature. */
  | "feature_merge"
  | "hotfix"
  /** `dev` merged into `main`: the sprint is shipped. */
  | "sprint_merge"
  /** Last node of a sprint, on `main`. Resolving it closes the sprint. */
  | "release";

export type NodeStatus = "locked" | "candidate" | "current" | "done";

export type CommitMode = "craft" | "ai";

export interface NodeCommit {
  mode: CommitMode;
  reviewed: boolean;
}

export interface MapNode {
  id: NodeId;
  sprint: number;
  kind: NodeKind;
  /** 0 is `main`, 1 is `dev`, 2 and up are features. */
  lane: number;
  /** Row in the graph. Strictly increases along every edge. */
  depth: number;
  /** Sorted, 1 to 3 entries; empty only on `release`. */
  next: NodeId[];
  branchId?: BranchId;
  /** Present on `feature_merge`: the skill merging the branch grants. */
  skillId?: SkillId;
  status: NodeStatus;
  /** A way this commit may be written instead of plainly. Offered in the panel. */
  offers?: DetourKind;
  commit?: NodeCommit;
}

export interface Branch {
  id: BranchId;
  kind: "feature" | "subfeature" | "hotfix" | "refactor";
  skillId?: SkillId;
  nodeIds: NodeId[];
  /** Main-line node the branch merges back into. */
  mergeInto: NodeId;
  parentBranchId?: BranchId;
  /** True once the player has stepped onto it. */
  open: boolean;
  merged: boolean;
}

export interface AiCommitRecord {
  nodeId: NodeId;
  reviewed: boolean;
}

export interface Player {
  /**
   * The node being written: where the next commit lands.
   *
   * Not where you *are*. In git you stand on the last commit you made, and the
   * one you are about to write does not exist yet — see `headId`.
   */
  nodeId: NodeId;
  /**
   * `HEAD`: the last node actually resolved.
   *
   * This is what the graph draws you on, and it is always a node that has been
   * written. It lags `nodeId` by exactly one commit, which is the whole point.
   */
  headId: NodeId;
  energy: number;
  energyMax: number;
  totalCommits: number;
  /** Turns finished with no energy left. Two in a row is burnout. */
  zeroEnergyStreak: number;
  /** Recent AI commits, oldest first, capped at the review window. */
  aiHistory: AiCommitRecord[];
  /** Consecutive AI commits, for the review chain bonus. */
  aiChain: number;
  /** Pair programming rerolls once per sprint. */
  rerollUsed: boolean;
  /** Turns since the automatic review last ran. */
  turnsSinceFreeReview: number;
  /** A craft success sometimes makes the next refactor node free. */
  freeRefactor: boolean;
  /** Machine-written commits still covered by a documentation node. */
  docsCharges: number;
}

export type GameOverReason = "burnout" | "fired";

/** Permanent stat investments from the meta-progression, carried into a run. */
export interface StatPoints {
  energyMax: number;
  luck: number;
  conflictRes: number;
}

export type Phase =
  /** Standing on an unresolved node: commit, review, or spend DevOps points. */
  | { kind: "choose_action" }
  /** The node is resolved; pick where to go next. */
  | { kind: "choose_node"; candidates: NodeId[] }
  /** `mode` is the commit the player attempted; the fix finishes that commit. */
  | { kind: "resolve_conflict"; nodeId: NodeId; mode: CommitMode }
  | { kind: "choose_relic"; offer: RelicId[] }
  | { kind: "game_over"; reason: GameOverReason };

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
  /** Number of main-line nodes in the current sprint. */
  sprintLength: number;

  nodes: Record<NodeId, MapNode>;
  branches: Record<BranchId, Branch>;
  /** Serials for generated ids, so nothing collides across sprints. */
  nextNodeSerial: number;
  nextBranchSerial: number;

  player: Player;

  skills: SkillId[];
  /** Feature skills this account has unlocked; the map draws branches from it. */
  unlockedSkills: SkillId[];
  /** Points spent on the account's level-up stats, folded into the effects. */
  statPoints: StatPoints;
  relics: RelicId[];
  devops: Record<DevopsId, number>;
  devopsPoints: number;

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
  xpEarned: number;

  phase: Phase;
  log: LogLine[];
  nextLogSeq: number;
}

export type PlayerAction =
  /** `kind` writes the node as the detour it offers, instead of a plain commit. */
  | { type: "commit"; mode: CommitMode; kind?: DetourKind }
  | { type: "review" }
  | { type: "move"; nodeId: NodeId }
  | { type: "devops"; id: DevopsId }
  | { type: "resolve_conflict"; how: "manual" | "ai" }
  | { type: "choose_relic"; relicId: RelicId };

export type PlayerActionType = PlayerAction["type"];

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
  | { type: "player_moved"; from: NodeId; to: NodeId }
  | { type: "ai_jumped"; nodeIds: NodeId[] }
  | { type: "candidates"; nodeIds: NodeId[] }
  | { type: "energy"; delta: number; value: number; reason: string }
  | { type: "debt"; delta: number; value: number }
  | { type: "branch_opened"; branchId: BranchId; kind: Branch["kind"] }
  | { type: "branch_merged"; branchId: BranchId; skillId?: SkillId }
  | { type: "skill_gained"; skillId: SkillId }
  | { type: "nodes_injected"; branchId: BranchId; nodeIds: NodeId[]; kind: Branch["kind"] }
  | { type: "conflict"; nodeId: NodeId }
  | { type: "conflict_resolved"; how: "manual" | "ai"; hiddenBug: boolean }
  | { type: "forced_rebase"; nodeId: NodeId; absorbed: boolean }
  | { type: "pr_rejected"; countered: boolean }
  | { type: "debt_explosion"; branchId: BranchId }
  | { type: "failure_event"; eventId: FailureEventId }
  | { type: "monitoring_warning" }
  | { type: "ambient_event"; eventId: AmbientEventId }
  | { type: "reviewed"; nodeIds: NodeId[]; debtDelta: number; chain: boolean; free: boolean }
  | { type: "squashed"; nodeIds: NodeId[]; debtDelta: number; commitsLost: number }
  | { type: "docs_written"; charges: number }
  | { type: "docs_used"; nodeId: NodeId; remaining: number }
  | { type: "rebased"; nodeIds: NodeId[] }
  | { type: "sprint_ended"; sprint: number; offer: RelicId[] }
  | { type: "sprint_started"; sprint: number }
  | { type: "relic_chosen"; relicId: RelicId }
  | { type: "devops_placed"; id: DevopsId; level: number }
  | { type: "devops_points"; delta: number; value: number }
  | { type: "crunch"; active: boolean }
  | { type: "game_over"; reason: GameOverReason; score: number };

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
  /** Nodes gained on success, as a range. */
  progress?: [number, number];
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

export type { AmbientEventId, EventId, FailureEventId, I18nText, RngState };
