import { Container, Graphics, Text } from "pixi.js";

import * as booyah from "@/game/chips/booyah";
import { sceneContext } from "@/game/chips/context";
import type { GraphView } from "@/game/chips/GraphView";
import { devColourIndex, PLAYER_COLOUR, TICKET_KIND } from "@/game/content";
import { DEV_LANE, MAIN_LANE } from "@/game/core/map/layout";
import type { NodeId } from "@/game/core/types";
import { nodeY } from "@/game/render/coords";
import { palette } from "@/game/render/palette";
import { cursorStyle } from "@/game/render/textStyles";
import { DEV_COLOURS } from "@/game/render/theme";

/**
 * The refs, drawn as pills in the gutter between the graph and the subjects,
 * the way a git client lists them beside the commit they point at: `main`,
 * `dev`, `HEAD`, and one per open ticket. A ref rides the newest commit of
 * its branch as drawn — a merge the effect queue has not revealed yet does
 * not move it. A branch someone holds says who, in their colour: a
 * developer's name on their ticket, yours beside `HEAD`.
 */

interface Owner {
  name: string;
  colour: number;
}
export class BranchRefs extends booyah.ChipBase {
  private layer!: Container;
  private pills = new Map<string, { root: Container; width: number; signature: string }>();
  /** Set by a restyle; the next tick remakes every pill in today's colours. */
  private stale = false;

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

    if (this.stale) {
      for (const pill of this.pills.values()) pill.root.destroy({ children: true });
      this.pills.clear();
      this.stale = false;
    }

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

    const refs: { key: string; label: string; colour: number; nodeId: NodeId; owner?: Owner }[] =
      [];
    const ownerOf = (devId: string | undefined): Owner | undefined => {
      const dev = devId === undefined ? undefined : state.devs.find((d) => d.id === devId);
      return dev === undefined
        ? undefined
        : { name: dev.name, colour: DEV_COLOURS[devColourIndex(dev.id)] ?? palette.player };
    };
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
      const def = TICKET_KIND[ticket.kind];
      const colour = palette.lane[def.colour];
      // Short branch names, the way a team abbreviates them: `feat/t3`.
      const prefix = def.refPrefix;
      const owner = ownerOf(ticket.assignee);
      refs.push({
        key: ticket.id,
        label: `${prefix}/${ticket.id}`,
        colour,
        nodeId: tip,
        ...(owner === undefined ? {} : { owner }),
      });
    }

    if (reveal.headId !== null && depthOf.has(reveal.headId)) {
      const { playerName } = sceneContext(this.chipContext);
      const owner: Owner | undefined =
        playerName === ""
          ? undefined
          : { name: playerName, colour: DEV_COLOURS[PLAYER_COLOUR] ?? palette.player };
      refs.push({
        key: "HEAD",
        label: "HEAD",
        colour: palette.player,
        nodeId: reveal.headId,
        ...(owner === undefined ? {} : { owner }),
      });
    }

    // Lay the pills out per row, left to right, in the gutter.
    const x0 = this.graph.refX();
    const offset = new Map<NodeId, number>();
    const live = new Set<string>();

    for (const ref of refs) {
      live.add(ref.key);
      // A pill is remade when its owner changes: a ticket handed back, a name learnt.
      const signature = `${ref.label}|${ref.owner?.name ?? ""}`;
      let pill = this.pills.get(ref.key);
      if (pill !== undefined && pill.signature !== signature) {
        pill.root.destroy({ children: true });
        this.pills.delete(ref.key);
        pill = undefined;
      }
      if (pill === undefined) {
        pill = { ...makePill(ref.label, ref.colour, ref.owner), signature };
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

  /**
   * Asks for the pills to be made again in today's colours. Deferred to the
   * next tick rather than done here: the austerity chip ticks after this
   * one, and throwing the pills away then would leave the frame without
   * any — for as long as the palette slides, which with a busy team is
   * nearly always.
   */
  restyle(): void {
    this.stale = true;
  }

  protected _onTerminate(): void {
    this.layer.destroy({ children: true });
    this.pills.clear();
  }
}

/** Room between a ref's pill and its owner's badge. */
const BADGE_GAP = 4;

/**
 * A ref pill, anchored on its left edge at the row's centre — and, when the
 * branch is somebody's, their name in a badge of its own right after it, in
 * their colour: two pills, so the ref reads as a ref and the name as a tag.
 */
function makePill(name: string, colour: number, owner?: Owner): { root: Container; width: number } {
  const root = new Container();
  const pill = chipWith(name, colour);
  root.addChild(pill.root);
  let width = pill.width;

  if (owner !== undefined) {
    const badge = chipWith(owner.name, owner.colour);
    badge.root.x = width + BADGE_GAP;
    root.addChild(badge.root);
    width += BADGE_GAP + badge.width;
  }
  return { root, width };
}

/** One rounded chip with a label in a colour, its left edge at x = 0. */
function chipWith(text: string, colour: number): { root: Container; width: number } {
  const root = new Container();

  const label = new Text({ text, style: { ...cursorStyle, fontSize: 10 } });
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
