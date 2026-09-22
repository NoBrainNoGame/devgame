import { Container, Graphics, Text } from "pixi.js";

import * as booyah from "@/game/chips/booyah";
import { sceneContext } from "@/game/chips/context";
import { DEV_LANE, MAIN_LANE } from "@/game/core/map/layout";
import { nodeX, nodeY } from "@/game/render/coords";
import { cursorStyle } from "@/game/render/textStyles";
import { NODE_RADIUS, THEME } from "@/game/render/theme";

/**
 * The `main` and `dev` refs, riding the newest commit of their column.
 *
 * Two long-lived branches carry no work: `dev` takes one merge per feature
 * delivered, `main` takes the sprint merge and the release. Without a label on
 * each, the two leftmost columns are just lines — and which one is which is the
 * thing a player needs to read first.
 */
export class BranchRefs extends booyah.ChipBase {
  private refs!: { lane: number; root: Container; y: number; placed: boolean }[];

  protected _onActivate(): void {
    const { world } = sceneContext(this.chipContext);

    this.refs = [
      { lane: MAIN_LANE, root: makeRef("main", THEME.lane.trunk), y: 0, placed: false },
      { lane: DEV_LANE, root: makeRef("dev", THEME.lane.dev), y: 0, placed: false },
    ];

    for (const ref of this.refs) {
      ref.root.visible = false;
      world.addChild(ref.root);
    }
  }

  protected _onTick(): void {
    const { session, reducedMotion } = sceneContext(this.chipContext);
    const state = session.getState();

    const ease = reducedMotion ? 1 : Math.min(1, this._lastTickInfo.timeSinceLastTick / 140);

    for (const ref of this.refs) {
      // The tip of the column.
      let top = Number.NEGATIVE_INFINITY;

      for (const node of Object.values(state.nodes)) {
        if (node.lane !== ref.lane || node.status !== "done") continue;
        if (node.depth > top) top = node.depth;
      }

      if (top === Number.NEGATIVE_INFINITY) {
        ref.root.visible = false;
        continue;
      }

      // `HEAD` hangs off the left of its own commit. When it is on this very
      // node — you just landed a merge — the two refs are stacked rather than
      // drawn on top of each other, which is what a git client does.
      const head = state.nodes[state.player.headId];
      const shared = head !== undefined && head.lane === ref.lane && head.depth === top;

      const target = nodeY(top) - (shared ? STACK : 0);
      ref.y = ref.placed ? ref.y + (target - ref.y) * ease : target;
      ref.placed = true;

      ref.root.visible = true;
      ref.root.position.set(nodeX(ref.lane), ref.y);
    }
  }

  protected _onTerminate(): void {
    for (const ref of this.refs) ref.root.destroy({ children: true });
  }
}

/** A ref pill hanging to the left of its column, the way `HEAD` does. */
function makeRef(name: string, colour: number): Container {
  const root = new Container();

  const label = new Text({ text: name, style: cursorStyle });
  label.anchor.set(1, 0.5);
  label.x = -NODE_RADIUS - 16;
  label.alpha = 0.85;

  const chip = new Graphics();
  chip
    .roundRect(-NODE_RADIUS - 20 - label.width - 8, -11, label.width + 16, 22, 11)
    .fill({ color: THEME.background, alpha: 0.92 })
    .stroke({ width: 1.5, color: colour, alpha: 0.7 });

  root.addChild(chip, label);
  return root;
}

/** Vertical room for a second ref on the same commit. */
const STACK = 24;
