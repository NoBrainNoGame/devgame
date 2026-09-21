import { Container, Graphics, Text } from "pixi.js";

import { ContainerChip } from "@/game/chips/ContainerChip";
import { sceneContext } from "@/game/chips/context";
import { mainLineNodes } from "@/game/core/map/graph";
import { nodeY } from "@/game/render/coords";
import { cursorStyle } from "@/game/render/textStyles";
import { NODE_RADIUS, THEME } from "@/game/render/theme";

/**
 * The rivals, drawn the way a git client draws a remote branch head: a label
 * riding the trunk at the height they have reached.
 *
 * They do not get commits of their own. A bot's progress is a pace, not a list
 * of things it wrote, and drawing nodes for it would claim more than the engine
 * knows — so what you see is a ref that has run ahead of yours, which is
 * exactly what it feels like to be behind.
 *
 * Position comes from an index into the main line rather than a depth, because
 * splicing in a hotfix shifts every depth below it and a rival should not
 * appear to leap forward because you broke production.
 */
/** How far left of the trunk a rival's ref sits. */
const GUTTER = 120;

export class BotCursors extends ContainerChip {
  private cursors!: Map<string, { root: Container; label: Text; target: number }>;

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
    const { reducedMotion } = sceneContext(this.chipContext);
    const ease = reducedMotion ? 1 : Math.min(1, this._lastTickInfo.timeSinceLastTick / 140);

    // Eased rather than snapped: a rival moving is the single most important
    // thing on screen after your own commit, and it has to be seen moving.
    for (const cursor of this.cursors.values()) {
      cursor.root.y += (cursor.target - cursor.root.y) * ease;
    }
  }

  private sync(): void {
    const { session, translate } = sceneContext(this.chipContext);
    const state = session.getState();
    const main = mainLineNodes(state, state.sprint);

    for (const id of Object.keys(state.bots).sort()) {
      const bot = state.bots[id];
      if (bot === undefined) continue;

      const existing = this.cursors.get(id);
      if (bot.fired) {
        existing?.root.destroy({ children: true });
        this.cursors.delete(id);
        continue;
      }

      const index = Math.min(bot.sprintProgress, Math.max(0, main.length - 1));
      const node = main[index];
      const next = main[Math.min(index + 1, main.length - 1)];
      if (node === undefined || next === undefined) continue;

      // The fraction of a node the accumulator has banked, so a rival about to
      // land a commit visibly leans into it.
      const fraction = Math.min(1, bot.acc / 100);
      const target = nodeY(node.depth) + (nodeY(next.depth) - nodeY(node.depth)) * fraction;

      if (existing !== undefined) {
        existing.target = target;
        existing.root.alpha = bot.stalled > 0 ? 0.4 : 1;
        continue;
      }

      const root = new Container();

      const label = new Text({
        text: translate({ key: `bots.${bot.archetype}.name` }),
        style: cursorStyle,
      });
      label.anchor.set(1, 0.5);
      label.x = -GUTTER + label.width;

      // A left gutter, well clear of the trunk and of the commit labels that
      // run down the right. A ref that lands on a commit reads as that commit's
      // author, which is the one thing it is not.
      const chip = new Graphics();
      chip
        .roundRect(-GUTTER - 8, -11, label.width + 16, 22, 11)
        .fill({ color: THEME.background, alpha: 0.92 })
        .stroke({ width: 1.5, color: THEME.bot, alpha: 0.8 });

      const arrow = new Graphics();
      arrow
        .moveTo(-GUTTER + label.width + 12, 0)
        .lineTo(-NODE_RADIUS - 8, 0)
        .stroke({ width: 1.5, color: THEME.bot, alpha: 0.45 });
      arrow
        .moveTo(-NODE_RADIUS - 12, -5)
        .lineTo(-NODE_RADIUS - 3, 0)
        .lineTo(-NODE_RADIUS - 12, 5)
        .fill(THEME.bot);

      root.addChild(arrow, chip, label);
      root.y = target;
      this._container.addChild(root);
      this.cursors.set(id, { root, label, target });
    }
  }
}
