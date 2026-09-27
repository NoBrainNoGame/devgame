import { Container, Graphics, Text } from "pixi.js";

import type * as booyah from "@/game/chips/booyah";
import { ContainerChip } from "@/game/chips/ContainerChip";
import { sceneContext } from "@/game/chips/context";
import { DEV_LANE, FIRST_FEATURE_LANE } from "@/game/core/map/layout";
import { obstaclesOf } from "@/game/core/rules/tickets";
import type { MapNode, NodeId, RunState } from "@/game/core/types";
import { labelX, nodeX, nodeY } from "@/game/render/coords";
import { drawBody, drawLocalBody, drawRings } from "@/game/render/drawNode";
import {
  drawDottedLane,
  drawEdge,
  drawLane,
  laneSegments,
  ticketColour,
} from "@/game/render/lanes";
import { palette } from "@/game/render/palette";
import { type Rows, rowsOf } from "@/game/render/rows";
import { labelStyle } from "@/game/render/textStyles";
import {
  LANE_ALPHA,
  LOCAL_DASH,
  LOCAL_GAP,
  laneColour,
  NODE_RADIUS,
  nodePrefix,
  REF_GUTTER,
} from "@/game/render/theme";

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
 *
 * Your commits arrive local, a dashed ring, and fill in as they are pushed.
 * Local commits pushed together become one (`bridge/pushes.ts`): their rows
 * close up (`render/rows.ts`), the most recent slides down to the oldest one's
 * row while the others fold into it, and everything above comes down with it,
 * so the history keeps no hole where they were.
 */

export interface GraphViewEvents extends booyah.BaseCompositeEvents {
  nodeHover: [nodeId: NodeId | null];
}

interface CommitSprite {
  root: Container;
  rings: Graphics;
  body: Graphics;
  localBody: Graphics;
  /** 0 to 1. Drives the grow-and-fade the node arrives with. */
  reveal: number;
  /** Drawn as not pushed yet. */
  local: boolean;
  /** 0 local, 1 pushed: the dashed ring fills in between. */
  pushed: number;
  /** Sliding into the commit it was squashed into, then gone. */
  fuse: { from: Point; into: NodeId; t: number } | null;
}

interface Point {
  x: number;
  y: number;
}

const REVEAL_MS = 260;
const PUSH_MS = 240;
const FUSE_MS = 360;
/** How fast rows close up after a squash: the time constant of the ease. */
const ROW_MS = 90;
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
  private topRow = 0;
  /** The commits drawn, as of the last rebuild. */
  private shown: MapNode[] = [];
  /** Where each commit's row is heading, and where it is drawn on the way. */
  private rows: Rows = { of: (node) => node.depth };
  private rowTarget = new Map<NodeId, number>();
  private rowNow = new Map<NodeId, number>();

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
    // bugged — without revealing anything.
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

    if (this.closeRows(delta, reducedMotion)) this.redrawPlaces();

    for (const [id, sprite] of this.sprites) {
      if (sprite.fuse !== null) {
        this.tickFuse(id, sprite, delta, reducedMotion);
        continue;
      }

      const growing = sprite.reveal < 1;
      const pushing = !sprite.local && sprite.pushed < 1;
      if (!growing && !pushing) continue;

      if (growing) {
        sprite.reveal = reducedMotion ? 1 : Math.min(1, sprite.reveal + delta / REVEAL_MS);
      }
      if (pushing) {
        sprite.pushed = reducedMotion ? 1 : Math.min(1, sprite.pushed + delta / PUSH_MS);
      }
      const eased = 1 - (1 - sprite.reveal) ** 3;

      // Overshoot slightly on the way in: a commit lands, it does not fade up.
      // And swell as it fills: pushed, it is there for everyone.
      const swell = 1 + 0.3 * Math.sin(Math.PI * sprite.pushed);
      sprite.root.scale.set(eased * (1 + 0.25 * (1 - eased)) * swell);
      sprite.root.alpha = eased;
      this.crossFade(sprite);

      const label = this.labels.get(id);
      if (label !== undefined && growing) label.alpha = eased * 0.75;
    }
  }

  /**
   * Eases every row towards where it is heading. Returns whether anything
   * moved, so the lines are only redrawn while a squash closes up.
   */
  private closeRows(delta: number, reducedMotion: boolean): boolean {
    const ease = reducedMotion ? 1 : Math.min(1, delta / ROW_MS);
    let moved = false;
    for (const [id, target] of this.rowTarget) {
      const now = this.rowNow.get(id) ?? target;
      if (now === target) continue;
      const next = Math.abs(target - now) < 0.002 ? target : now + (target - now) * ease;
      this.rowNow.set(id, next);
      moved = true;
    }
    return moved;
  }

  /** The row a commit is drawn on right now: moving, while a squash closes up. */
  rowOf(id: NodeId): number {
    const now = this.rowNow.get(id);
    if (now !== undefined) return now;
    const node = this.node(id);
    return node === undefined ? 0 : this.rows.of(node);
  }

  /** The row a commit is heading for: where the camera should look. */
  targetRowOf(id: NodeId): number {
    const target = this.rowTarget.get(id);
    if (target !== undefined) return target;
    const node = this.node(id);
    return node === undefined ? 0 : this.rows.of(node);
  }

  /** Lines, discs and subjects where the rows are now. */
  private redrawPlaces(): void {
    const { session } = sceneContext(this.chipContext);
    const state = session.getState();
    this.drawLanes(state, this.shown);
    this.drawEdges(state, this.shown);
    for (const node of this.shown) {
      const sprite = this.sprites.get(node.id);
      if (sprite === undefined || sprite.fuse !== null) continue;
      const y = nodeY(this.rowOf(node.id));
      sprite.root.position.set(nodeX(node.lane), y);
      const label = this.labels.get(node.id);
      if (label !== undefined) label.y = y;
    }
  }

  /** Accelerates into the commit it was pushed with, shrinking, then is gone. */
  private tickFuse(id: NodeId, sprite: CommitSprite, delta: number, reducedMotion: boolean): void {
    const fuse = sprite.fuse;
    if (fuse === null) return;
    fuse.t = reducedMotion ? 1 : Math.min(1, fuse.t + delta / FUSE_MS);
    const eased = fuse.t ** 3;

    // The commit it goes into is moving too, down to its new row: follow it.
    const target = this.node(fuse.into);
    const to =
      target === undefined ? fuse.from : { x: nodeX(target.lane), y: nodeY(this.rowOf(fuse.into)) };
    sprite.root.position.set(
      fuse.from.x + (to.x - fuse.from.x) * eased,
      fuse.from.y + (to.y - fuse.from.y) * eased,
    );
    sprite.root.scale.set(1 - 0.5 * eased);
    sprite.root.alpha = 1 - 0.8 * eased;
    const label = this.labels.get(id);
    if (label !== undefined) label.alpha = 0.75 * (1 - fuse.t);

    if (fuse.t >= 1) this.drop(id);
  }

  private crossFade(sprite: CommitSprite): void {
    sprite.body.alpha = sprite.pushed;
    sprite.localBody.alpha = 1 - sprite.pushed;
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
    const { session, reveal, reducedMotion } = sceneContext(this.chipContext);
    const state = session.getState();
    const nodes = this.revealed();
    this.shown = nodes;

    // Where every row is heading now. A commit seen for the first time is
    // drawn straight on its row; one already there eases to its new one when
    // a squash below it closes up.
    this.rows = rowsOf(state.nodes, reveal.absorbed);
    const targets = new Map<NodeId, number>();
    for (const node of nodes) {
      const target = this.rows.of(node);
      targets.set(node.id, target);
      if (reducedMotion || !this.rowNow.has(node.id)) this.rowNow.set(node.id, target);
    }
    for (const id of [...this.rowNow.keys()]) if (!targets.has(id)) this.rowNow.delete(id);
    this.rowTarget = targets;

    this.maxLane = Math.max(DEV_LANE, ...nodes.map((node) => node.lane));
    this.topRow = Math.max(0, ...targets.values());

    this.drawLanes(state, nodes);
    this.drawEdges(state, nodes);

    // A squashed commit goes into the one it was pushed with, and its row
    // closes up behind it.
    const folded = new Map<NodeId, number>();
    for (const into of reveal.absorbed.values()) folded.set(into, (folded.get(into) ?? 1) + 1);

    const live = new Set<NodeId>();
    for (const node of nodes) {
      const into = reveal.absorbed.get(node.id);
      if (into !== undefined) {
        const sprite = this.sprites.get(node.id);
        if (sprite === undefined) continue;
        live.add(node.id);
        this.fuseInto(node.id, sprite, into);
        continue;
      }
      live.add(node.id);
      this.upsert(node, reveal.local.has(node.id), folded.get(node.id) ?? 1);
    }

    for (const id of [...this.sprites.keys()]) {
      if (!live.has(id)) this.drop(id);
    }
  }

  private drop(id: NodeId): void {
    this.sprites.get(id)?.root.destroy({ children: true });
    this.sprites.delete(id);
    this.labels.get(id)?.destroy();
    this.labels.delete(id);
  }

  private fuseInto(id: NodeId, sprite: CommitSprite, into: NodeId): void {
    if (sprite.fuse !== null) return;
    const target = this.node(into);
    if (target === undefined) {
      this.drop(id);
      return;
    }
    sprite.root.eventMode = "none";
    if (this.hovered === id) this.setHovered(null);
    sprite.fuse = { from: { x: sprite.root.position.x, y: sprite.root.position.y }, into, t: 0 };
  }

  /**
   * One line per branch, between its own commits only: the trunks continue
   * dotted to the top row, a ticket's line stops at its tip. `laneSegments`
   * decides; this only strokes.
   */
  private drawLanes(state: RunState, nodes: readonly MapNode[]): void {
    const { reveal } = sceneContext(this.chipContext);
    this.lanes.clear();

    // A feature an obstacle is holding waits, dotted, while the obstacle is written.
    // Rows, not depths: the lines close up with the squashes too.
    const segments = laneSegments(
      nodes.map((node) => ({
        lane: node.lane,
        depth: this.rowOf(node.id),
        ticketId: node.ticketId,
        local: reveal.local.has(node.id),
      })),
      (id) => state.tickets[id]?.kind,
      Math.max(this.topRow, ...nodes.map((node) => this.rowOf(node.id))),
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
      } else if (segment.style === "local") {
        drawDottedLane(
          this.lanes,
          segment.lane,
          segment.from,
          segment.to,
          colour,
          LANE_ALPHA.feature,
          LOCAL_DASH,
          LOCAL_GAP,
        );
      } else {
        const alpha = segment.lane < FIRST_FEATURE_LANE ? LANE_ALPHA.trunk : LANE_ALPHA.feature;
        drawLane(this.lanes, segment.lane, segment.from, segment.to, colour, alpha);
      }
    }
  }

  private drawEdges(state: RunState, nodes: readonly MapNode[]): void {
    const { reveal } = sceneContext(this.chipContext);
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
        // A fork into a commit not pushed yet: the branch is only yours so far.
        drawEdge(
          this.edges,
          { lane: parent.lane, depth: this.rowOf(parent.id) },
          { lane: node.lane, depth: this.rowOf(node.id) },
          colour,
          0.9,
          reveal.local.has(node.id),
        );
      }
    }
  }

  // --- commits --------------------------------------------------------------

  private upsert(node: MapNode, local: boolean, squashed: number): void {
    const { translate, subjects } = sceneContext(this.chipContext);
    let sprite = this.sprites.get(node.id);
    const subject = `${nodePrefix(node.kind, node.commit.mode)}: ${translate({ key: node.subjectKey })}`;
    // Commits pushed as one read as one, and say how many they were.
    const text = squashed > 1 ? `${subject} (×${squashed})` : subject;

    if (sprite === undefined) {
      const root = new Container();
      const rings = new Graphics();
      const localBody = new Graphics();
      const body = new Graphics();
      root.addChild(rings, localBody, body);

      root.eventMode = "static";
      root.cursor = "help";
      root.hitArea = { contains: (x, y) => x * x + y * y <= (NODE_RADIUS + 8) ** 2 };
      root.on("pointerover", () => this.setHovered(node.id));
      root.on("pointerout", () => {
        if (this.hovered === node.id) this.setHovered(null);
      });

      this.nodeLayer.addChild(root);
      sprite = {
        root,
        rings,
        body,
        localBody,
        reveal: 0,
        local,
        pushed: local ? 0 : 1,
        fuse: null,
      };
      this.sprites.set(node.id, sprite);

      if (subjects) {
        const label = new Text({ text, style: labelStyle });
        label.anchor.set(0, 0.5);
        label.alpha = 0;
        this.labelLayer.addChild(label);
        this.labels.set(node.id, label);
      }
    }

    const x = nodeX(node.lane);
    const y = nodeY(this.rowOf(node.id));

    sprite.root.position.set(x, y);
    // Pushed is forward only; a picture rebuilt from the ledger starts where it stands.
    sprite.local = local;
    if (local) sprite.pushed = 0;
    drawRings(sprite.rings, node, this.hovered === node.id);
    drawBody(sprite.body, node);
    if (local || sprite.pushed < 1) drawLocalBody(sprite.localBody, node);
    else sprite.localBody.clear();
    this.crossFade(sprite);

    const label = this.labels.get(node.id);
    if (label !== undefined) {
      if (label.text !== text) label.text = text;
      label.position.set(this.subjectX(), y);
      label.visible = this.showLabels;
    }
  }

  private setHovered(id: NodeId | null): void {
    this.hovered = id;
    this.emit("nodeHover", id);

    for (const [nodeId, sprite] of this.sprites) {
      const node = this.node(nodeId);
      if (node !== undefined) drawRings(sprite.rings, node, this.hovered === nodeId);
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
    // Asked before activation there is nothing to answer with. `RunScene`
    // activates the graph before the camera, so this is only a safety net.
    if (this.sprites === undefined) return null;

    const all = this.revealed();
    if (all.length === 0) return null;

    const xs = all.map((node) => nodeX(node.lane));
    const ys = all.map((node) => nodeY(this.targetRowOf(node.id)));

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
