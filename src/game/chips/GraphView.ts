import { Container, Graphics, Text } from "pixi.js";

import type * as booyah from "@/game/chips/booyah";
import { ContainerChip } from "@/game/chips/ContainerChip";
import { sceneContext } from "@/game/chips/context";
import type { MapNode, NodeId } from "@/game/core/types";
import { nodeX, nodeY } from "@/game/render/coords";
import { drawCommit } from "@/game/render/drawNode";
import { drawEdge } from "@/game/render/lanes";
import { glyphStyle, labelStyle } from "@/game/render/textStyles";
import { labelledKind, laneColour, NODE_RADIUS, nodeGlyph, nodePrefix } from "@/game/render/theme";

/**
 * The history, as it is written.
 *
 * The graph shows **what has happened and nothing else**. The engine holds no
 * commit before it is written — a ticket is a demand, not a path — so the
 * graph stops at the last commit: nothing above it, not even a hint of what
 * comes next. A ticket's column appears with its first commit and not before.
 *
 * A new commit is never inserted silently: `reveal` animates it in, which is
 * what lets a machine-written burst of three read as three separate things
 * happening rather than as the graph suddenly being longer.
 *
 * Nothing is drawn for the commit you are *about* to write. It does not exist
 * yet, and a hollow circle where it will go is the graph claiming to know the
 * future.
 */

export interface GraphViewEvents extends booyah.BaseCompositeEvents {
  nodeHover: [nodeId: NodeId | null];
}

interface CommitSprite {
  root: Container;
  graphics: Graphics;
  /** 0 to 1. Drives the grow-and-fade the node arrives with. */
  reveal: number;
}

const REVEAL_MS = 260;

export class GraphView extends ContainerChip<GraphViewEvents> {
  private edges!: Graphics;
  private nodeLayer!: Container;
  private labelLayer!: Container;

  private sprites!: Map<NodeId, CommitSprite>;
  private labels!: Map<NodeId, Text>;
  private hovered: NodeId | null = null;
  /** Labels are noise when the graph is zoomed out to find your way. */
  private showLabels = true;

  protected _onActivate(): void {
    this.edges = new Graphics();
    this.nodeLayer = new Container();
    this.labelLayer = new Container();
    this.sprites = new Map();
    this.labels = new Map();

    this._container.addChild(this.edges, this.nodeLayer, this.labelLayer);

    // Two triggers, on purpose. The reveal set says *what* is drawn, and an
    // applied action can change *how* a commit already drawn looks — reviewed,
    // squashed — without revealing anything.
    const { session, reveal } = sceneContext(this.chipContext);
    this._subscribe(session, "applied", () => this.rebuild());
    this._subscribe(reveal, "changed", () => this.rebuild());

    this.rebuild();
  }

  protected _onTerminate(): void {
    this.sprites.clear();
    this.labels.clear();
  }

  protected _onTick(): void {
    const delta = this._lastTickInfo.timeSinceLastTick;
    const { reducedMotion } = sceneContext(this.chipContext);

    for (const [id, sprite] of this.sprites) {
      if (sprite.reveal >= 1) continue;

      sprite.reveal = reducedMotion ? 1 : Math.min(1, sprite.reveal + delta / REVEAL_MS);
      const eased = 1 - (1 - sprite.reveal) ** 3;

      // Overshoot slightly on the way in: a commit lands, it does not fade up.
      sprite.root.scale.set(eased * (1 + 0.18 * (1 - eased)));
      sprite.root.alpha = eased;

      const label = this.labels.get(id);
      if (label !== undefined) label.alpha = eased * 0.75;
    }
  }

  // --- what is visible ------------------------------------------------------

  /** The commits the effect queue has shown so far. */
  private revealed(): MapNode[] {
    const { session, reveal } = sceneContext(this.chipContext);
    const state = session.getState();

    return [...reveal.nodes]
      .sort()
      .map((id) => state.nodes[id])
      .filter((node): node is MapNode => node !== undefined);
  }

  private rebuild(): void {
    const nodes = this.revealed();

    this.drawEdges(nodes);

    const live = new Set<NodeId>();
    for (const node of nodes) {
      live.add(node.id);
      this.upsert(node);
    }

    for (const [id, sprite] of this.sprites) {
      if (live.has(id)) continue;
      sprite.root.destroy({ children: true });
      this.sprites.delete(id);
      this.labels.get(id)?.destroy();
      this.labels.delete(id);
    }
  }

  private drawEdges(nodes: readonly MapNode[]): void {
    this.edges.clear();

    const shown = new Set(nodes.map((node) => node.id));
    const { session } = sceneContext(this.chipContext);
    const state = session.getState();

    // An edge runs from a commit to each of its parents, the way git records
    // it: a merge draws two, one straight up its column and one bending in
    // from the ticket it landed.
    for (const node of nodes) {
      for (const parentId of node.parents) {
        if (!shown.has(parentId)) continue;
        const parent = state.nodes[parentId];
        if (parent === undefined) continue;

        drawEdge(this.edges, parent, node, laneColour(node.lane, node.kind), 0.95);
      }
    }
  }

  // --- commits --------------------------------------------------------------

  private upsert(node: MapNode): void {
    const { translate } = sceneContext(this.chipContext);
    let sprite = this.sprites.get(node.id);

    if (sprite === undefined) {
      const root = new Container();
      const graphics = new Graphics();
      root.addChild(graphics);

      const glyph = glyphFor(node);
      if (glyph !== "") {
        const text = new Text({ text: glyph, style: glyphStyle });
        text.anchor.set(0.5);
        root.addChild(text);
      }

      root.eventMode = "static";
      root.cursor = "help";
      root.hitArea = { contains: (x, y) => x * x + y * y <= (NODE_RADIUS + 10) ** 2 };
      root.on("pointerover", () => this.setHovered(node.id));
      root.on("pointerout", () => {
        if (this.hovered === node.id) this.setHovered(null);
      });

      this.nodeLayer.addChild(root);
      sprite = { root, graphics, reveal: 0 };
      this.sprites.set(node.id, sprite);

      const label = new Text({
        text: `${nodePrefix(node.kind, node.commit?.mode)}: ${translate({
          key: `nodes.${labelledKind(node.kind)}.name`,
        })}`,
        style: labelStyle,
      });
      label.anchor.set(0, 0.5);
      label.alpha = 0;
      this.labelLayer.addChild(label);
      this.labels.set(node.id, label);
    }

    const x = nodeX(node.lane);
    const y = nodeY(node.depth);

    sprite.root.position.set(x, y);
    drawCommit(sprite.graphics, node, this.hovered === node.id);

    const label = this.labels.get(node.id);
    if (label !== undefined) {
      label.position.set(x + NODE_RADIUS + 12, y);
      label.visible = this.showLabels;
    }
  }

  private setHovered(id: NodeId | null): void {
    this.hovered = id;
    this.emit("nodeHover", id);

    for (const [nodeId, sprite] of this.sprites) {
      const node = this.node(nodeId);
      if (node !== undefined) drawCommit(sprite.graphics, node, this.hovered === nodeId);
    }
  }

  private node(id: NodeId): MapNode | undefined {
    const { session } = sceneContext(this.chipContext);
    return session.getState().nodes[id];
  }

  /** Screen position of a commit, so the HUD can put a tooltip beside it. */
  screenPositionOf(id: NodeId): { x: number; y: number } | null {
    const sprite = this.sprites.get(id);
    if (sprite === undefined) return null;

    const global = sprite.root.getGlobalPosition();
    return { x: global.x, y: global.y };
  }

  /** Labels are hidden when zoomed out, where they would overlap into noise. */
  setLabelsVisible(visible: boolean): void {
    if (this.showLabels === visible) return;
    this.showLabels = visible;
    for (const label of this.labels.values()) label.visible = visible;
  }

  /** Every revealed node's position, for the camera's framing. */
  bounds(): { minX: number; maxX: number; minY: number; maxY: number } | null {
    // The camera is a sibling in the same `Parallel` and may be activated
    // first, so it can ask before there is anything to answer with.
    if (this.sprites === undefined) return null;

    const all = this.revealed();
    if (all.length === 0) return null;

    const xs = all.map((node) => nodeX(node.lane));
    const ys = all.map((node) => nodeY(node.depth));

    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
  }
}

/** A glyph on every node is a glyph on none, so ordinary commits stay plain. */
function glyphFor(node: MapNode): string {
  if (node.kind === "commit") return "";
  return nodeGlyph(node.kind);
}
