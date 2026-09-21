import { Container, Graphics, Text } from "pixi.js";

import type * as booyah from "@/game/chips/booyah";
import { ContainerChip } from "@/game/chips/ContainerChip";
import { sceneContext } from "@/game/chips/context";
import type { BotNode, MapNode, NodeId } from "@/game/core/types";
import { nodeX, nodeY } from "@/game/render/coords";
import { drawCommit, drawPending } from "@/game/render/drawNode";
import { drawEdge } from "@/game/render/lanes";
import { glyphStyle, labelStyle } from "@/game/render/textStyles";
import {
  EDGE_WIDTH,
  labelledKind,
  laneColour,
  NODE_RADIUS,
  nodeGlyph,
  nodePrefix,
  THEME,
} from "@/game/render/theme";

/**
 * The history, as it is written.
 *
 * The graph shows **what has happened and nothing else**. The engine knows the
 * whole sprint in advance — it has to, or a run could not be replayed — but
 * showing it would turn the game into a board you walk across, when the fiction
 * is a repository you are building commit by commit. So the graph stops at the
 * node you are standing on: nothing above it, not even a hint of a branch. The
 * next commit is drawn when you have chosen it, and a fork appears only once
 * you have opened the branch that makes it one.
 *
 * A new commit is never inserted silently: `reveal` animates it in, which is
 * what lets a machine-written burst of three read as three separate things
 * happening rather than as the graph suddenly being longer.
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
  private botLane!: Graphics;
  private nodeLayer!: Container;
  private labelLayer!: Container;
  private pending!: Graphics;

  private sprites!: Map<NodeId, CommitSprite>;
  private labels!: Map<NodeId, Text>;
  private hovered: NodeId | null = null;
  private pulse = 0;
  /** Labels are noise when the graph is zoomed out to find your way. */
  private showLabels = true;

  protected _onActivate(): void {
    this.edges = new Graphics();
    this.botLane = new Graphics();
    this.nodeLayer = new Container();
    this.labelLayer = new Container();
    this.pending = new Graphics();
    this.sprites = new Map();
    this.labels = new Map();

    this._container.addChild(
      this.botLane,
      this.edges,
      this.pending,
      this.nodeLayer,
      this.labelLayer,
    );

    const { session } = sceneContext(this.chipContext);
    this._subscribe(session, "applied", () => this.rebuild());

    this.rebuild();
  }

  protected _onTerminate(): void {
    this.sprites.clear();
    this.labels.clear();
  }

  protected _onTick(): void {
    const delta = this._lastTickInfo.timeSinceLastTick;
    const { reducedMotion } = sceneContext(this.chipContext);

    this.pulse = (this.pulse + delta / 900) % 1;
    const wave = 0.5 + 0.5 * Math.sin(this.pulse * Math.PI * 2);

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

    this.drawPendingNode(wave);
  }

  // --- what is visible ------------------------------------------------------

  /**
   * Nodes the player has actually resolved. A node the engine generated but
   * nobody has reached does not exist as far as the graph is concerned.
   */
  private revealed(): MapNode[] {
    const { session } = sceneContext(this.chipContext);
    const state = session.getState();

    return Object.keys(state.nodes)
      .sort()
      .map((id) => state.nodes[id])
      .filter((node): node is MapNode => node !== undefined && node.status === "done");
  }

  private rebuild(): void {
    const nodes = this.revealed();

    this.drawEdges(nodes);
    this.drawBotNodes();

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

    for (const node of nodes) {
      for (const nextId of node.next) {
        if (!shown.has(nextId)) continue;
        const next = state.nodes[nextId];
        if (next === undefined) continue;

        drawEdge(this.edges, node, next, laneColour(next.lane, next.kind), 0.95);
      }
    }
  }

  /**
   * What the rivals have written, in a column each, to the left of `main`.
   *
   * They used to be a dashed line and a floating label — a pace, drawn as an
   * absence. Now they write commits and land merges exactly as you do, so the
   * graph shows four repositories being built side by side and "the Rapide is
   * two features ahead" is something you can see rather than read.
   */
  private drawBotNodes(): void {
    this.botLane.clear();

    const { session } = sceneContext(this.chipContext);
    const state = session.getState();

    const byLane = new Map<number, BotNode[]>();
    for (const id of Object.keys(state.botNodes).sort()) {
      const node = state.botNodes[id];
      if (node === undefined) continue;
      const column = byLane.get(node.lane);
      if (column === undefined) byLane.set(node.lane, [node]);
      else column.push(node);
    }

    for (const column of byLane.values()) {
      column.sort((a, b) => a.depth - b.depth);

      for (let i = 0; i < column.length - 1; i += 1) {
        const below = column[i];
        const above = column[i + 1];
        if (below === undefined || above === undefined) continue;
        this.botLane
          .moveTo(nodeX(below.lane), nodeY(below.depth))
          .lineTo(nodeX(above.lane), nodeY(above.depth));
      }
    }

    this.botLane.stroke({ width: EDGE_WIDTH - 1, color: THEME.bot, alpha: 0.45, cap: "round" });

    for (const column of byLane.values()) {
      for (const node of column) {
        const x = nodeX(node.lane);
        const y = nodeY(node.depth);

        if (node.kind === "feature_merge") {
          this.botLane
            .circle(x, y, NODE_RADIUS - 3)
            .fill({ color: THEME.bot, alpha: 0.85 })
            .stroke({ width: 2, color: THEME.background });
        } else {
          this.botLane
            .circle(x, y, NODE_RADIUS - 6)
            .fill({ color: THEME.background })
            .stroke({ width: 2, color: THEME.bot, alpha: 0.7 });
        }
      }
    }
  }

  private drawPendingNode(wave: number): void {
    const { session } = sceneContext(this.chipContext);
    const state = session.getState();

    this.pending.clear();
    if (state.phase.kind === "game_over") return;

    const head = state.nodes[state.player.nodeId];
    if (head === undefined || head.status === "done") return;

    this.pending.position.set(nodeX(head.lane), nodeY(head.depth));
    drawPending(this.pending, wave);
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

    const nodes = this.revealed();
    const head = this.node(sceneContext(this.chipContext).session.getState().player.nodeId);
    const all = head === undefined ? nodes : [...nodes, head];
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
  if (node.kind === "commit" || node.kind === "feature") return "";
  return nodeGlyph(node.kind);
}
