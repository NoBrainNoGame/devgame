import { Container, Graphics, Text } from "pixi.js";

import { ContainerChip } from "@/game/chips/ContainerChip";
import { sceneContext } from "@/game/chips/context";
import { mainLineNodes } from "@/game/core/map/graph";
import { nodeX, nodeY } from "@/game/render/coords";
import { cursorStyle } from "@/game/render/textStyles";
import { NODE_RADIUS, THEME } from "@/game/render/theme";

/**
 * The rivals, drawn as cursors sliding down `main`.
 *
 * Their position comes from an index into the main line, not from a depth: a
 * hotfix splices nodes into the graph and pushes every depth below it down, and
 * a bot should not appear to leap forward because you broke production.
 *
 * The fractional part of their progress accumulator is drawn too, so a bot that
 * is about to reach the next node looks like it is about to.
 */
export class BotCursors extends ContainerChip {
  private cursors!: Map<string, { root: Container; label: Text }>;

  protected _onActivate(): void {
    this.cursors = new Map();
    this.sync();

    const { session } = sceneContext(this.chipContext);
    this._subscribe(session, "applied", () => this.sync());
  }

  protected _onTerminate(): void {
    this.cursors.clear();
  }

  protected _onTick(): void {
    this.place();
  }

  private sync(): void {
    const { session, translate } = sceneContext(this.chipContext);
    const state = session.getState();

    for (const id of Object.keys(state.bots).sort()) {
      const bot = state.bots[id];
      if (bot === undefined) continue;

      const existing = this.cursors.get(id);
      if (bot.fired) {
        existing?.root.destroy({ children: true });
        this.cursors.delete(id);
        continue;
      }
      if (existing !== undefined) continue;

      const root = new Container();
      const arrow = new Graphics();
      arrow
        .moveTo(-NODE_RADIUS - 6, -6)
        .lineTo(-NODE_RADIUS + 4, 0)
        .lineTo(-NODE_RADIUS - 6, 6)
        .fill(THEME.bot);

      const label = new Text({
        text: translate({ key: `bots.${bot.archetype}.name` }),
        style: cursorStyle,
      });
      label.anchor.set(1, 0.5);
      label.x = -NODE_RADIUS - 10;

      root.addChild(arrow, label);
      this._container.addChild(root);
      this.cursors.set(id, { root, label });
    }

    this.place();
  }

  private place(): void {
    const { session } = sceneContext(this.chipContext);
    const state = session.getState();
    const main = mainLineNodes(state, state.sprint);
    if (main.length === 0) return;

    for (const [id, cursor] of this.cursors) {
      const bot = state.bots[id];
      if (bot === undefined) continue;

      const index = Math.min(bot.sprintProgress, main.length - 1);
      const node = main[index];
      const next = main[Math.min(index + 1, main.length - 1)];
      if (node === undefined || next === undefined) continue;

      const fraction = Math.min(1, bot.acc / 100);
      cursor.root.x = nodeX(node.lane);
      cursor.root.y = nodeY(node.depth) + (nodeY(next.depth) - nodeY(node.depth)) * fraction;
      cursor.root.alpha = bot.stalled > 0 ? 0.45 : 1;
    }
  }
}
