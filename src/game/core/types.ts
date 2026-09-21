import type {
  AmbientEventId,
  BotArchetypeId,
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
export type BotId = string;
export type BranchId = string;

export type RunMode = "classic" | "daily";

export type NodeKind =
  /** Anchor the player stands on when a sprint opens; never played. */
  | "sprint_start"
  | "commit"
  /** Detour that repays debt. */
  | "refactor"
  /** Detour that jumps further for a worse roll. */
  | "risky"
  /** Detour that draws an ambient event. */
  | "chore"
  /** Detour that erases machine-written history: debt repaid, commits lost. */
  | "squash"
  /** Detour that buys the next few machine-written commits out of their debt. */
  | "docs"
  /** Detour that replays the trunk on top of you. Cheap when clean, brutal when not. */
  | "rebase"
  /** A main-line node a feature branch leaves from. */
  | "fork"
  | "feature"
  /** Last node of a feature branch; merging it grants the skill. */
  | "feature_merge"
  | "hotfix"
  | "sprint_merge"
  /** Last node of a sprint. Resolving it closes the sprint. */
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
  /** 0 is `main`, positive lanes are features, negative lanes are hotfixes. */
  lane: number;
  /** Row in the graph. Strictly increases along every edge. */
  depth: number;
  /** Sorted, 1 to 3 entries; empty only on `release`. */
  next: NodeId[];
  branchId?: BranchId;
  /** Present on `feature_merge`: the skill merging the branch grants. */
  skillId?: SkillId;
  status: NodeStatus;
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

/**
 * A commit a rival wrote.
 *
 * Rivals build in their own column: they write commits and merge them, which is
 * the only honest way to show a pace as work. They are kept apart from
 * `state.nodes` because they are not part of the player's graph — nothing can
 * be walked onto, and none of the DAG invariants apply to them.
 */
export interface BotNode {
  id: NodeId;
  botId: BotId;
  kind: "commit" | "feature_merge";
  lane: number;
  depth: number;
}

export interface Bot {
  id: BotId;
  archetype: BotArchetypeId;
  /** Commits written per turn, in percent of one. */
  speedPct: number;
  /** Accumulates `speedPct` per turn; every full 100 is one commit. */
  acc: number;
  /** The column this rival works in. Never one of yours. */
  lane: number;
  /** Commits written into the feature it currently has open. */
  featureCommits: number;
  /** Depth of its last commit, so its column climbs as it works. */
  depth: number;
  /** Features delivered this sprint: the number the race is run in. */
  sprintProgress: number;
  totalProgress: number;
  /** Turns left to skip after a mistake. */
  stalled: number;
  /** Debt you inherit if you get it fired. */
  debt: number;
  /** Your reputation relative to this bot, recomputed every turn. */
  reputation: number;
  /** Consecutive turns spent above its firing threshold. */
  firingProgress: number;
  /** Turns needed at that threshold. Copied from the archetype. */
  firingTurns: number;
  fired: boolean;
}

export interface AiCommitRecord {
  nodeId: NodeId;
  reviewed: boolean;
}

export interface Player {
  nodeId: NodeId;
  energy: number;
  energyMax: number;
  /**
   * Position in the race, as an index into this sprint's main line — the same
   * unit the rivals hold, so the two can be subtracted.
   *
   * It is not a count of nodes resolved. Branch and detour work costs turns and
   * earns commits, but it is not ground a rival could have taken, and counting
   * it advanced the player in a race the bots could not enter.
   */
  sprintProgress: number;
  /** Furthest main-line index reached, so a penalty is not undone by the next node. */
  mainReached: number;
  totalCommits: number;
  /** Turns finished with no energy left. Two in a row is burnout. */
  zeroEnergyStreak: number;
  /** Turns spent far behind the leading bot. Enough of them gets you fired. */
  overtakenStreak: number;
  /** Recent AI commits, oldest first, capped at the review window. */
  aiHistory: AiCommitRecord[];
  /** Consecutive AI commits, for the review chain bonus. */
  aiChain: number;
  /** Pair programming rerolls once per sprint. */
  rerollUsed: boolean;
  /** Turns since the DevOps review bot last ran. */
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
  bots: Record<BotId, Bot>;
  /** Everything the rivals have written, drawn beside your graph. */
  botNodes: Record<NodeId, BotNode>;
  nextBotSerial: number;
  nextBotNodeSerial: number;

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
  botsFired: number;
  xpEarned: number;

  phase: Phase;
  log: LogLine[];
  nextLogSeq: number;
}

export type PlayerAction =
  | { type: "commit"; mode: CommitMode }
  | { type: "review" }
  | { type: "move"; nodeId: NodeId }
  | { type: "devops"; id: DevopsId }
  | { type: "resolve_conflict"; how: "manual" | "ai" }
  | { type: "choose_relic"; relicId: RelicId };

export type PlayerActionType = PlayerAction["type"];

export interface BotFiringRewards {
  xp: number;
  commits: number;
  debt: number;
  skillId: SkillId;
}

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
  | { type: "pr_rejected"; botId: BotId | null; countered: boolean }
  | { type: "debt_explosion"; branchId: BranchId }
  | { type: "failure_event"; eventId: FailureEventId }
  | { type: "monitoring_warning" }
  | { type: "ambient_event"; eventId: AmbientEventId }
  | { type: "reviewed"; nodeIds: NodeId[]; debtDelta: number; chain: boolean; free: boolean }
  | { type: "squashed"; nodeIds: NodeId[]; debtDelta: number; commitsLost: number }
  | { type: "docs_written"; charges: number }
  | { type: "docs_used"; nodeId: NodeId; remaining: number }
  | { type: "rebased"; nodeIds: NodeId[] }
  | { type: "bot_advanced"; botId: BotId; from: number; to: number }
  | { type: "bot_committed"; botId: BotId; nodeId: NodeId; merged: boolean }
  | { type: "bot_mistake"; botId: BotId; archetype: BotArchetypeId }
  | { type: "reputation"; botId: BotId; value: number; firingProgress: number }
  | { type: "bot_fired"; botId: BotId; archetype: BotArchetypeId; rewards: BotFiringRewards }
  | { type: "bot_arrived"; botId: BotId; archetype: BotArchetypeId }
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
  /** Whether taking this action lets the bots move. */
  botsAdvance: boolean;
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
