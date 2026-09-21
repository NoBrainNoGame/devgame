import { Container, Graphics, Text } from "pixi.js";

import type * as booyah from "@/game/chips/booyah";
import { ContainerChip } from "@/game/chips/ContainerChip";
import { sceneContext } from "@/game/chips/context";
import type { MapNode, NodeId } from "@/game/core/types";
import { nodeX, nodeY } from "@/game/render/coords";
import { drawNode } from "@/game/render/drawNode";
import { glyphStyle } from "@/game/render/textStyles";
import { EDGE_WIDTH, laneColour, NODE_RADIUS, nodeGlyph, THEME } from "@/game/render/theme";

/**
 * Draws the git graph and turns pointer events on it into intentions.
 *
 * It rebuilds from the run state whenever an action lands. A graph of a few
 * hundred nodes redraws in well under a frame, and an incremental diff would
 * buy nothing except a class of bugs where the picture and the state disagree.
 */

export interface GraphViewEvents extends booyah.BaseCompositeEvents {
  nodeHover: [nodeId: NodeId | null];
  nodeTap: [nodeId: NodeId];
}

export class GraphView extends ContainerChip<GraphViewEvents> {
  private edges!: Graphics;
  private nodeLayer!: Container;
  private sprites!: Map<NodeId, { root: Container; graphics: Graphics }>;
  private hovered: NodeId | null = null;
  /** Drives the pulse on the nodes the player may step to. */
  private pulse = 0;

  protected _onActivate(): void {
    this.edges = new Graphics();
    this.nodeLayer = new Container();
    this.sprites = new Map();

    this._container.addChild(this.edges, this.nodeLayer);

    const { session } = sceneContext(this.chipContext);
    this._subscribe(session, "applied", () => this.rebuild());

    this.rebuild();
  }

  protected _onTerminate(): void {
    this.sprites.clear();
  }

  protected _onTick(): void {
    const { reducedMotion } = sceneContext(this.chipContext);
    if (reducedMotion) return;

    this.pulse += this._lastTickInfo.timeSinceLastTick / 1000;

    const alpha = 0.55 + 0.45 * Math.sin(this.pulse * 3);
    for (const [id, sprite] of this.sprites) {
      const node = this.node(id);
      sprite.root.alpha = node?.status === "candidate" ? alpha : 1;
    }
  }

  private node(id: NodeId): MapNode | undefined {
    return sceneContext(this.chipContext).session.getState().nodes[id];
  }

  private rebuild(): void {
    const { session } = sceneContext(this.chipContext);
    const state = session.getState();
    const nodes = Object.keys(state.nodes)
      .sort()
      .flatMap((id) => {
        const node = state.nodes[id];
        return node === undefined ? [] : [node];
      });

    this.drawEdges(nodes);

    const live = new Set<NodeId>();
    for (const node of nodes) {
      live.add(node.id);
      this.upsert(node);
    }

    // A node can only disappear if the run restarted under us.
    for (const [id, sprite] of this.sprites) {
      if (live.has(id)) continue;
      sprite.root.destroy({ children: true });
      this.sprites.delete(id);
    }
  }

  private drawEdges(nodes: readonly MapNode[]): void {
    this.edges.clear();

    const byId = new Map(nodes.map((node) => [node.id, node]));

    for (const node of nodes) {
      for (const nextId of node.next) {
        const next = byId.get(nextId);
        if (next === undefined) continue;

        const from = { x: nodeX(node.lane), y: nodeY(node.depth) };
        const to = { x: nodeX(next.lane), y: nodeY(next.depth) };
        const colour = laneColour(next.lane === 0 ? node.lane : next.lane, next.kind);
        const walked = node.status === "done" && next.status === "done";

        if (from.x === to.x) {
          this.edges.moveTo(from.x, from.y).lineTo(to.x, to.y);
        } else {
          // A fork or a merge bends once, the way `git log --graph` draws it:
          // straight down the old column, then across into the new one.
          const bend = to.y - NODE_RADIUS * 2;
          this.edges
            .moveTo(from.x, from.y)
            .lineTo(from.x, bend)
            .quadraticCurveTo(from.x, to.y, to.x, to.y);
        }

        this.edges.stroke({
          width: EDGE_WIDTH,
          color: colour,
          alpha: walked ? 0.9 : 0.35,
        });
      }
    }
  }

  private upsert(node: MapNode): void {
    let sprite = this.sprites.get(node.id);

    if (sprite === undefined) {
      const root = new Container();
      const graphics = new Graphics();
      root.addChild(graphics);

      const glyph = nodeGlyph(node.kind);
      if (glyph !== "") {
        const text = new Text({ text: glyph, style: glyphStyle });
        text.anchor.set(0.5);
        root.addChild(text);
      }

      root.eventMode = "static";
      root.cursor = "pointer";
      root.hitArea = { contains: (x, y) => x * x + y * y <= (NODE_RADIUS + 8) ** 2 };

      root.on("pointerover", () => {
        this.hovered = node.id;
        this.emit("nodeHover", node.id);
        this.refresh(node.id);
      });
      root.on("pointerout", () => {
        if (this.hovered !== node.id) return;
        this.hovered = null;
        this.emit("nodeHover", null);
        this.refresh(node.id);
      });
      root.on("pointertap", () => this.emit("nodeTap", node.id));

      this.nodeLayer.addChild(root);
      sprite = { root, graphics };
      this.sprites.set(node.id, sprite);
    }

    sprite.root.position.set(nodeX(node.lane), nodeY(node.depth));
    drawNode(sprite.graphics, node, this.hovered === node.id);
  }

  private refresh(id: NodeId): void {
    const node = this.node(id);
    const sprite = this.sprites.get(id);
    if (node === undefined || sprite === undefined) return;
    drawNode(sprite.graphics, node, this.hovered === id);
  }

  /** World position of a node, for the camera and the cursors. */
  positionOf(id: NodeId): { x: number; y: number } | null {
    const node = this.node(id);
    if (node === undefined) return null;
    return { x: nodeX(node.lane), y: nodeY(node.depth) };
  }

  /** Flashes a node, for a conflict or a failure. */
  flash(id: NodeId, colour = THEME.lane.hotfix): void {
    const sprite = this.sprites.get(id);
    if (sprite === undefined) return;
    sprite.graphics.circle(0, 0, NODE_RADIUS + 7).stroke({ width: 3, color: colour });
  }
}
