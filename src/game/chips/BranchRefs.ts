import { Container, Graphics, Text } from "pixi.js";

import * as booyah from "@/game/chips/booyah";
import { sceneContext } from "@/game/chips/context";
import type { GraphView } from "@/game/chips/GraphView";
import { DEV_LANE, MAIN_LANE } from "@/game/core/map/layout";
import type { NodeId } from "@/game/core/types";
import { nodeY } from "@/game/render/coords";
import { palette } from "@/game/render/palette";
import { cursorStyle } from "@/game/render/textStyles";

/**
 * The refs, drawn as pills in the gutter between the graph and the subjects,
 * the way a git client lists them beside the commit they point at: `main`,
 * `dev`, `HEAD`, and one per open ticket. A ref rides the newest commit of
 * its branch as drawn — a merge the effect queue has not revealed yet does
 * not move it.
 */
export class BranchRefs extends booyah.ChipBase {
  private layer!: Container;
  private pills = new Map<string, { root: Container; width: number }>();

  constructor(private readonly graph: GraphView) {
    super();
  }

  protected _onActivate(): void {
    const { world } = sceneContext(this.chipContext);
    this.layer = new Container();
    world.addChild(this.layer);
  }

  protected _onTick(): void {
    const { session, reveal } = sceneContext(this.chipContext);
    const state = session.getState();

    // Which commit each ref sits on, as drawn.
    const tipOfLane = new Map<number, NodeId>();
    const depthOf = new Map<NodeId, number>();
    for (const id of reveal.nodes) {
      const node = state.nodes[id];
      if (node === undefined) continue;
      depthOf.set(id, node.depth);
      const current = tipOfLane.get(node.lane);
      if (current === undefined || (depthOf.get(current) ?? -1) < node.depth) {
        tipOfLane.set(node.lane, id);
      }
    }

    const refs: { key: string; label: string; colour: number; nodeId: NodeId }[] = [];
    const main = tipOfLane.get(MAIN_LANE);
    if (main !== undefined)
      refs.push({ key: "main", label: "main", colour: palette.lane.trunk, nodeId: main });
    const dev = tipOfLane.get(DEV_LANE);
    if (dev !== undefined)
      refs.push({ key: "dev", label: "dev", colour: palette.lane.dev, nodeId: dev });

    for (const ticket of Object.values(state.tickets)) {
      if (ticket.status !== "open" || ticket.lane === undefined) continue;
      const tip = tipOfLane.get(ticket.lane);
      if (tip === undefined) continue;
      const colour = ticket.kind === "hotfix" ? palette.lane.hotfix : palette.lane.feature;
      // Short branch names, the way a team abbreviates them: `feat/t3`.
      const prefix =
        ticket.kind === "feature" ? "feat" : ticket.kind === "hotfix" ? "fix" : "refacto";
      refs.push({ key: ticket.id, label: `${prefix}/${ticket.id}`, colour, nodeId: tip });
    }

    if (reveal.headId !== null && depthOf.has(reveal.headId)) {
      refs.push({ key: "HEAD", label: "HEAD", colour: palette.player, nodeId: reveal.headId });
    }

    // Lay the pills out per row, left to right, in the gutter.
    const x0 = this.graph.refX();
    const offset = new Map<NodeId, number>();
    const live = new Set<string>();

    for (const ref of refs) {
      live.add(ref.key);
      let pill = this.pills.get(ref.key);
      if (pill === undefined) {
        pill = makePill(ref.label, ref.colour);
        this.pills.set(ref.key, pill);
        this.layer.addChild(pill.root);
      }
      const depth = depthOf.get(ref.nodeId) ?? 0;
      const dx = offset.get(ref.nodeId) ?? 0;
      pill.root.position.set(x0 + dx, nodeY(depth));
      offset.set(ref.nodeId, dx + pill.width + 4);
    }

    for (const [key, pill] of this.pills) {
      if (live.has(key)) continue;
      pill.root.destroy({ children: true });
      this.pills.delete(key);
    }
  }

  /** Throws the pills away; the next tick makes them again in today's colours. */
  restyle(): void {
    for (const pill of this.pills.values()) pill.root.destroy({ children: true });
    this.pills.clear();
  }

  protected _onTerminate(): void {
    this.layer.destroy({ children: true });
    this.pills.clear();
  }
}

/** A ref pill, anchored on its left edge at the row's centre. */
function makePill(name: string, colour: number): { root: Container; width: number } {
  const root = new Container();

  const label = new Text({ text: name, style: { ...cursorStyle, fontSize: 10 } });
  label.anchor.set(0, 0.5);
  label.x = 6;
  label.tint = colour;

  const width = label.width + 12;
  const chip = new Graphics();
  chip
    .roundRect(0, -8, width, 16, 4)
    .fill({ color: palette.background, alpha: 0.95 })
    .stroke({ width: 1, color: colour, alpha: 0.8 });

  root.addChild(chip, label);
  return { root, width };
}
