import { Container, Graphics, Text } from "pixi.js";

import type * as booyah from "@/game/chips/booyah";
import { ContainerChip } from "@/game/chips/ContainerChip";
import { sceneContext } from "@/game/chips/context";
import { DEV_LANE, FIRST_FEATURE_LANE } from "@/game/core/map/layout";
import { obstaclesOf } from "@/game/core/rules/tickets";
import type { MapNode, NodeId, RunState } from "@/game/core/types";
import { labelX, nodeX, nodeY } from "@/game/render/coords";
import { drawCommit } from "@/game/render/drawNode";
import {
  drawDottedLane,
  drawEdge,
  drawLane,
  laneSegments,
  ticketColour,
} from "@/game/render/lanes";
import { palette } from "@/game/render/palette";
import { labelStyle } from "@/game/render/textStyles";
import { LANE_ALPHA, laneColour, NODE_RADIUS, nodePrefix, REF_GUTTER } from "@/game/render/theme";

/**
 * The history, drawn the way a git client draws it.
 *
 * Three things, layered: the lanes — one continuous line per branch for as
 * long as it is alive — then the commits as small discs on them, then a
 * column of subjects to the right of the graph, past the gutter where the
 * refs sit. `main` and `dev` never end; a ticket's line runs from the row it
 * forked on to its tip, and on up to the present while it is still open.
 *
 * The graph shows **what has happened and nothing else**. The engine holds no
 * commit before it is written, so the graph stops at the last commit: nothing
 * above it, not even a hint of what comes next. A new commit is never inserted
 * silently: the reveal set says when, and the sprite grows in.
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
/** Room a commit subject takes, for framing. */
const SUBJECT_WIDTH = 200;
/** Room the refs take when there are no subjects past them, for framing: a branch name and its owner's. */
const REF_WIDTH = 150;

export class GraphView extends ContainerChip<GraphViewEvents> {
  private lanes!: Graphics;
  private edges!: Graphics;
  private nodeLayer!: Container;
  private labelLayer!: Container;

  private sprites!: Map<NodeId, CommitSprite>;
  private labels!: Map<NodeId, Text>;
  private hovered: NodeId | null = null;
  /** Labels are noise when the graph is zoomed out to find your way. */
  private showLabels = true;
  /** The rightmost column drawn, which is where the label column starts. */
  private maxLane = DEV_LANE;
  /** The highest row drawn: how far the living branches' lines run. */
  private topDepth = 0;

  protected _onActivate(): void {
    this.lanes = new Graphics();
    this.edges = new Graphics();
    this.nodeLayer = new Container();
    this.labelLayer = new Container();
    this.sprites = new Map();
    this.labels = new Map();

    this._container.addChild(this.lanes, this.edges, this.nodeLayer, this.labelLayer);

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
      sprite.root.scale.set(eased * (1 + 0.25 * (1 - eased)));
      sprite.root.alpha = eased;

      const label = this.labels.get(id);
      if (label !== undefined) label.alpha = eased * 0.75;
    }
  }

  /** Redraws everything with the palette as it is now: the ambience moved. */
  restyle(): void {
    this.rebuild();
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
    const { session } = sceneContext(this.chipContext);
    const state = session.getState();
    const nodes = this.revealed();

    this.maxLane = Math.max(DEV_LANE, ...nodes.map((node) => node.lane));
    this.topDepth = Math.max(0, ...nodes.map((node) => node.depth));

    this.drawLanes(state, nodes);
    this.drawEdges(state, nodes);

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

  /**
   * One line per branch, between its own commits only: the trunks continue
   * dotted to the top row, a ticket's line stops at its tip. `laneSegments`
   * decides; this only strokes.
   */
  private drawLanes(state: RunState, nodes: readonly MapNode[]): void {
    this.lanes.clear();

    // A feature an obstacle is holding waits, dotted, while the obstacle is written.
    const segments = laneSegments(
      nodes,
      (id) => state.tickets[id]?.kind,
      this.topDepth,
      (id) => {
        const ticket = state.tickets[id];
        return ticket?.status === "open" && obstaclesOf(state, ticket).length > 0;
      },
    );
    for (const segment of segments) {
      const colour = palette.lane[segment.colour];
      if (segment.style === "dotted") {
        const alpha = LANE_ALPHA.continuation;
        drawDottedLane(this.lanes, segment.lane, segment.from, segment.to, colour, alpha);
      } else {
        const alpha = segment.lane < FIRST_FEATURE_LANE ? LANE_ALPHA.trunk : LANE_ALPHA.feature;
        drawLane(this.lanes, segment.lane, segment.from, segment.to, colour, alpha);
      }
    }
  }

  private drawEdges(state: RunState, nodes: readonly MapNode[]): void {
    this.edges.clear();
    const shown = new Set(nodes.map((node) => node.id));

    // An edge runs from a commit to each of its parents, the way git records
    // it. Only the ones that change column are drawn here — along a column the
    // lane already is the edge.
    for (const node of nodes) {
      for (const parentId of node.parents) {
        if (!shown.has(parentId)) continue;
        const parent = state.nodes[parentId];
        if (parent === undefined || parent.lane === node.lane) continue;

        // A fork takes the colour of the branch it opens; a merge, of the
        // branch it brings home. A ticket's branch is its kind's colour.
        const branch = node.lane >= FIRST_FEATURE_LANE ? node : parent;
        const colour =
          branch.lane >= FIRST_FEATURE_LANE && branch.ticketId !== undefined
            ? palette.lane[ticketColour(state.tickets[branch.ticketId]?.kind)]
            : laneColour(branch.lane, branch.kind);
        drawEdge(this.edges, parent, node, colour, 0.9);
      }
    }
  }

  // --- commits --------------------------------------------------------------

  private upsert(node: MapNode): void {
    const { translate, subjects } = sceneContext(this.chipContext);
    let sprite = this.sprites.get(node.id);

    if (sprite === undefined) {
      const root = new Container();
      const graphics = new Graphics();
      root.addChild(graphics);

      root.eventMode = "static";
      root.cursor = "help";
      root.hitArea = { contains: (x, y) => x * x + y * y <= (NODE_RADIUS + 8) ** 2 };
      root.on("pointerover", () => this.setHovered(node.id));
      root.on("pointerout", () => {
        if (this.hovered === node.id) this.setHovered(null);
      });

      this.nodeLayer.addChild(root);
      sprite = { root, graphics, reveal: 0 };
      this.sprites.set(node.id, sprite);

      if (subjects) {
        const label = new Text({
          text: `${nodePrefix(node.kind, node.commit.mode)}: ${translate({ key: node.subjectKey })}`,
          style: labelStyle,
        });
        label.anchor.set(0, 0.5);
        label.alpha = 0;
        this.labelLayer.addChild(label);
        this.labels.set(node.id, label);
      }
    }

    const x = nodeX(node.lane);
    const y = nodeY(node.depth);

    sprite.root.position.set(x, y);
    drawCommit(sprite.graphics, node, this.hovered === node.id);

    const label = this.labels.get(node.id);
    if (label !== undefined) {
      label.position.set(this.subjectX(), y);
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

  // --- what the others read -------------------------------------------------

  /** Where the refs column starts, right of the last lane drawn. */
  refX(): number {
    return labelX(this.maxLane);
  }

  /** Where the subjects start, past the refs. */
  subjectX(): number {
    return this.refX() + REF_GUTTER;
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

    // The subjects are part of the picture: centring the lanes alone parks
    // them half off screen on a narrow canvas. Without them, the refs are
    // the picture's right edge.
    const { subjects } = sceneContext(this.chipContext);
    const rightEdge = subjects ? this.subjectX() + SUBJECT_WIDTH : this.refX() + REF_WIDTH;
    return {
      minX: Math.min(...xs),
      maxX: Math.max(rightEdge, ...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
  }
}
