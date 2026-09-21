import type { AppliedPayload } from "@/game/bridge/session";
import { gameStore } from "@/game/bridge/store";
import * as booyah from "@/game/chips/booyah";
import { sceneContext } from "@/game/chips/context";
import { Flash } from "@/game/chips/fx/Flash";
import { Look } from "@/game/chips/fx/Look";
import { Pop } from "@/game/chips/fx/Pop";
import { Beat, type SkipFlag } from "@/game/chips/fx/skip";
import { devLineNodes } from "@/game/core/map/graph";
import type { GameEvent, NodeId } from "@/game/core/types";
import { nodeX, nodeY } from "@/game/render/coords";
import { THEME } from "@/game/render/theme";

/**
 * Plays a turn's events one after another.
 *
 * The HUD updates the moment an action is applied, but the canvas is a story:
 * the commit lands, then the rival moves, then production catches fire. Booyah's
 * `Queue` gives that ordering for free — each effect terminates itself and the
 * next one activates on the following tick.
 *
 * While the queue is draining, `pendingAnimation` is true and the session
 * refuses new actions. A click anywhere skips to the end rather than waiting,
 * because a player who already knows what happened should not have to watch.
 */
export class FxQueue extends booyah.Queue {
  private readonly skipFlag: SkipFlag = { value: false };

  protected _onActivate(): void {
    super._onActivate?.();

    const { session } = sceneContext(this.chipContext);
    this._subscribe(session, "applied", (...args: unknown[]) => {
      const payload = args[0] as AppliedPayload | undefined;
      if (payload !== undefined) this.enqueue(payload.events);
    });
  }

  /**
   * Cuts the rest of the sequence short. The queue still drains a frame at a
   * time, but every remaining effect ends the moment it starts, and the UI
   * unblocks immediately — the board is already up to date, only the show was
   * still running.
   */
  skip(): void {
    this.skipFlag.value = true;
    gameStore.setState({ pendingAnimation: false });
  }

  private enqueue(events: readonly GameEvent[]): void {
    this.skipFlag.value = false;
    // A turn opens on the player: whatever the camera went to look at last, the
    // action that started this batch is theirs.
    this.focus(null);
    let queued = 0;

    for (const event of events) {
      const chip = this.effectFor(event);
      if (chip === null) continue;
      this.add(chip);
      queued += 1;
    }

    // Even a turn with nothing to show gets one beat, so the UI has a moment
    // to settle rather than flickering between two states in the same frame.
    if (queued === 0) this.add(new Beat(60, this.skipFlag));

    this.add(
      new booyah.Lambda(() => {
        this.focus(null);
        gameStore.setState({ pendingAnimation: false });
      }),
    );
  }

  private effectFor(event: GameEvent): booyah.Chip | null {
    const { translate } = sceneContext(this.chipContext);

    switch (event.type) {
      case "node_done": {
        const at = this.positionOf(event.nodeId);
        if (at === null) return null;
        return new Pop(
          at,
          event.mode === "ai" ? "ai" : "+1",
          event.mode === "ai" ? THEME.node.ai : THEME.node.craft,
          380,
          this.skipFlag,
        );
      }

      case "energy":
        return new Pop(
          this.playerPosition(),
          `${event.delta > 0 ? "+" : ""}${event.delta}⚡`,
          THEME.energy,
          650,
          this.skipFlag,
        );

      case "debt":
        return new Pop(
          this.playerPosition(),
          `${event.delta > 0 ? "+" : ""}${event.delta}`,
          THEME.debt,
          650,
          this.skipFlag,
        );

      case "conflict": {
        const at = this.positionOf(event.nodeId);
        return at === null ? null : new Flash(at, THEME.lane.hotfix, 420, this.skipFlag);
      }

      case "nodes_injected": {
        const first = event.nodeIds[0];
        if (first === undefined) return null;
        const at = this.positionOf(first);
        return at === null
          ? null
          : new Flash(
              at,
              event.kind === "hotfix" ? THEME.lane.hotfix : THEME.lane.refactor,
              420,
              this.skipFlag,
            );
      }

      case "forced_rebase":
        return event.absorbed ? null : new Flash(this.playerPosition(), THEME.lane.hotfix, 300);

      case "pr_rejected":
        return event.countered
          ? null
          : new Flash(this.playerPosition(), THEME.bot, 300, this.skipFlag);

      case "skill_gained":
        return new Pop(
          this.playerPosition(),
          translate({ key: `skills.${event.skillId}.name` }),
          THEME.lane.feature,
          900,
          this.skipFlag,
        );

      case "bot_fired":
        return new Pop(
          this.playerPosition(),
          translate({ key: `bots.${event.archetype}.name` }),
          THEME.bot,
          900,
          this.skipFlag,
        );

      case "bot_advanced": {
        const y = this.mainLineY(event.to);
        return y === null ? null : new Look(y, 320, this.skipFlag);
      }

      case "sprint_started":
        return new Beat(200, this.skipFlag);

      case "roll":
      case "ai_jumped":
        return new Beat(120, this.skipFlag);

      default:
        return null;
    }
  }

  private positionOf(id: NodeId): { x: number; y: number } | null {
    const { session } = sceneContext(this.chipContext);
    const node = session.getState().nodes[id];
    if (node === undefined) return null;
    return { x: nodeX(node.lane), y: nodeY(node.depth) };
  }

  /**
   * Where a rival sits, in world space. Its progress is an index into the main
   * line rather than a depth, because splicing in a hotfix shifts every depth
   * below it and a rival must not appear to leap because production broke.
   */
  private mainLineY(index: number): number | null {
    const { session } = sceneContext(this.chipContext);
    const state = session.getState();
    const main = devLineNodes(state, state.sprint);
    const node = main[Math.min(Math.max(index, 0), main.length - 1)];
    return node === undefined ? null : nodeY(node.depth);
  }

  private focus(y: number | null): void {
    sceneContext(this.chipContext).controls.camera?.focusOn(y);
  }

  private playerPosition(): { x: number; y: number } {
    const { session } = sceneContext(this.chipContext);
    const state = session.getState();
    return this.positionOf(state.player.headId) ?? { x: 0, y: 0 };
  }
}
