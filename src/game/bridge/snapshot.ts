import type { DevopsId, ProfileId, RelicId, SkillId } from "@/game/content";
import { getAvailableActions } from "@/game/core/rules/actions";
import {
  type DebtView,
  debtView,
  energyMax,
  gatherEffects,
  isCrunch,
  isOverextended,
  reviewedRatio,
} from "@/game/core/rules/modifiers";
import { previewAll } from "@/game/core/rules/preview";
import { computeScore } from "@/game/core/score";
import type {
  ActionPreview,
  Branch,
  BranchId,
  DetourKind,
  MapNode,
  NodeId,
  Phase,
  PlayerAction,
  RunMode,
  RunState,
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
  /** The node being written: where the next commit will land. */
  nodeId: NodeId;
  /** `HEAD`: the last node actually written. This is where the graph draws you. */
  headId: NodeId;
  energy: number;
  energyMax: number;
  totalCommits: number;
  crunch: boolean;
  overextended: boolean;
  reviewedRatio: number;
  unreviewed: number;
}

export interface RunSnapshot {
  seed: string;
  mode: RunMode;
  profileId: ProfileId;

  turn: number;
  sprint: number;
  sprintLength: number;
  score: number;
  xpEarned: number;

  phase: Phase;
  candidates: NodeId[];
  actions: PlayerAction[];
  /** Keyed by `actionKey`, so a button can look up its own numbers. */
  previews: Record<string, ActionPreview>;

  player: PlayerView;
  debt: DebtView;

  skills: SkillId[];
  relics: RelicId[];
  devops: Record<DevopsId, number>;
  devopsPoints: number;

  /** Enough of each node for a tooltip, without exposing the board itself. */
  nodes: Record<
    NodeId,
    Pick<MapNode, "id" | "kind" | "status" | "lane" | "depth" | "skillId" | "commit" | "branchId">
  >;

  /**
   * What each branch is for, without its node list.
   *
   * The skill a branch grants sits on its *merge* node, at the far end, so
   * until this existed the one decision the game asks most often — open this
   * branch or stay on `main` — was the only one made blind. The design's own
   * rule is that costs and effects are shown before the choice.
   *
   * The node ids are deliberately left out: they are the shape of a sprint
   * nobody has walked yet, and the graph is not allowed to know it.
   */
  branches: Record<
    BranchId,
    Pick<Branch, "id" | "kind" | "skillId" | "open" | "merged"> & {
      /** Commits to write before it can be merged. What the branch costs. */
      commits: number;
      /**
       * The ways its commits may be written, deduplicated and sorted.
       *
       * This is what tells two branches apart when neither grants a skill. A
       * branch carrying a squash and a documentation commit is a different
       * proposition from one carrying a rebase, and the player has to be able
       * to see that before choosing rather than after walking it.
       */
      offers: DetourKind[];
      /** True when a feature of its own leaves it partway. */
      forks: boolean;
    }
  >;
}

export function toSnapshot(state: RunState): RunSnapshot {
  const effects = gatherEffects(state);
  const actions = getAvailableActions(state);

  const nodes: RunSnapshot["nodes"] = {};
  for (const id of Object.keys(state.nodes).sort()) {
    const node = state.nodes[id];
    if (node === undefined) continue;
    nodes[id] = {
      id: node.id,
      kind: node.kind,
      status: node.status,
      lane: node.lane,
      depth: node.depth,
      ...(node.skillId === undefined ? {} : { skillId: node.skillId }),
      ...(node.commit === undefined ? {} : { commit: { ...node.commit } }),
      ...(node.branchId === undefined ? {} : { branchId: node.branchId }),
    };
  }

  const branches: RunSnapshot["branches"] = {};
  for (const id of Object.keys(state.branches).sort()) {
    const branch = state.branches[id];
    if (branch === undefined) continue;
    branches[id] = {
      id: branch.id,
      kind: branch.kind,
      ...(branch.skillId === undefined ? {} : { skillId: branch.skillId }),
      open: branch.open,
      merged: branch.merged,
      commits: branch.nodeIds.length,
      offers: offersOf(state, branch),
      forks: Object.values(state.branches).some((other) => other.parentBranchId === branch.id),
    };
  }

  return {
    seed: state.seed,
    mode: state.mode,
    profileId: state.profileId,

    turn: state.turn,
    sprint: state.sprint,
    sprintLength: state.sprintLength,
    score: computeScore(state),
    xpEarned: state.xpEarned,

    phase: state.phase,
    candidates: state.phase.kind === "choose_node" ? [...state.phase.candidates] : [],
    actions,
    previews: previewAll(state, actions),

    player: {
      nodeId: state.player.nodeId,
      headId: state.player.headId,
      energy: state.player.energy,
      energyMax: energyMax(state, effects),
      totalCommits: state.player.totalCommits,
      crunch: isCrunch(state),
      overextended: isOverextended(state),
      reviewedRatio: reviewedRatio(state),
      unreviewed: state.player.aiHistory.filter((entry) => !entry.reviewed).length,
    },

    debt: debtView(state, effects),

    skills: [...state.skills],
    relics: [...state.relics],
    devops: { ...state.devops },
    devopsPoints: state.devopsPoints,

    nodes,
    branches,
  };
}

/** Every distinct way a commit on this branch may be written, in a stable order. */
function offersOf(state: RunState, branch: Branch): DetourKind[] {
  const seen = new Set<DetourKind>();
  for (const id of branch.nodeIds) {
    const offers = state.nodes[id]?.offers;
    if (offers !== undefined) seen.add(offers);
  }
  return [...seen].sort();
}
