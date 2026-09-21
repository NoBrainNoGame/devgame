import type { BotArchetypeId, DevopsId, ProfileId, RelicId, SkillId } from "@/game/content";
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

export interface BotView {
  id: string;
  archetype: BotArchetypeId;
  sprintProgress: number;
  reputation: number;
  firingProgress: number;
  firingTurns: number;
  stalled: boolean;
  fired: boolean;
  speedPct: number;
}

export interface PlayerView {
  nodeId: NodeId;
  energy: number;
  energyMax: number;
  sprintProgress: number;
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
  botsFired: number;

  phase: Phase;
  candidates: NodeId[];
  actions: PlayerAction[];
  /** Keyed by `actionKey`, so a button can look up its own numbers. */
  previews: Record<string, ActionPreview>;

  player: PlayerView;
  debt: DebtView;
  bots: BotView[];

  skills: SkillId[];
  relics: RelicId[];
  devops: Record<DevopsId, number>;
  devopsPoints: number;

  /** Enough of each node for a tooltip, without exposing the board itself. */
  nodes: Record<NodeId, Pick<MapNode, "id" | "kind" | "status" | "lane" | "skillId">>;
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
      ...(node.skillId === undefined ? {} : { skillId: node.skillId }),
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
    botsFired: state.botsFired,

    phase: state.phase,
    candidates: state.phase.kind === "choose_node" ? [...state.phase.candidates] : [],
    actions,
    previews: previewAll(state, actions),

    player: {
      nodeId: state.player.nodeId,
      energy: state.player.energy,
      energyMax: energyMax(state, effects),
      sprintProgress: state.player.sprintProgress,
      totalCommits: state.player.totalCommits,
      crunch: isCrunch(state),
      overextended: isOverextended(state),
      reviewedRatio: reviewedRatio(state),
      unreviewed: state.player.aiHistory.filter((entry) => !entry.reviewed).length,
    },

    debt: debtView(state, effects),

    bots: Object.keys(state.bots)
      .sort()
      .flatMap((id) => {
        const bot = state.bots[id];
        return bot === undefined
          ? []
          : [
              {
                id: bot.id,
                archetype: bot.archetype,
                sprintProgress: bot.sprintProgress,
                reputation: bot.reputation,
                firingProgress: bot.firingProgress,
                firingTurns: bot.firingTurns,
                stalled: bot.stalled > 0,
                fired: bot.fired,
                speedPct: bot.speedPct,
              },
            ];
      }),

    skills: [...state.skills],
    relics: [...state.relics],
    devops: { ...state.devops },
    devopsPoints: state.devopsPoints,

    nodes,
  };
}
