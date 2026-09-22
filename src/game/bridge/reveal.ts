import { Emitter } from "@/game/bridge/emitter";
import { headOf } from "@/game/core/map/graph";
import type { NodeId, RunState } from "@/game/core/types";

/**
 * What the graph is allowed to draw right now.
 *
 * The engine writes a whole turn at once — a commit, the debt it added, the
 * incident it caused, the hotfix that opened — and the views used to redraw
 * all of it the instant the action applied. The effects then played over a
 * graph that was already finished, and the camera followed nothing.
 *
 * So the views no longer read the state to decide *what* to show, only how to
 * draw it. This set is the what. The effect queue reveals commits one at a
 * time as their moment comes; a skip, a reduced-motion setting or the end of
 * a batch reveals everything. Only the effect queue writes here, and every
 * view redraws on `changed`.
 */

export interface RevealSnapshot {
  nodes: ReadonlySet<NodeId>;
  headId: NodeId | null;
}

export class RevealSet extends Emitter {
  readonly nodes = new Set<NodeId>();
  /**
   * `HEAD` as drawn, which lags the engine's during a batch: the marker sits on
   * the last commit revealed, not on the one the engine has already moved to.
   */
  headId: NodeId | null = null;

  /** Draws a commit. Returns whether it was new. */
  showNode(id: NodeId, asHead = true): boolean {
    const fresh = !this.nodes.has(id);
    this.nodes.add(id);
    if (asHead) this.headId = id;
    if (fresh || asHead) this.emit("changed");
    return fresh;
  }

  /**
   * Everything the engine has written, with `HEAD` where the engine puts it —
   * and nothing it has since thrown away: a restarted ticket's commits are
   * gone from the state, so they go from the screen too.
   */
  showAll(state: RunState): void {
    let changed = false;
    for (const id of Object.keys(state.nodes)) {
      if (!this.nodes.has(id)) {
        this.nodes.add(id);
        changed = true;
      }
    }
    for (const id of [...this.nodes]) {
      if (!(id in state.nodes)) {
        this.nodes.delete(id);
        changed = true;
      }
    }
    const head = headOf(state).id;
    if (head !== this.headId) {
      this.headId = head;
      changed = true;
    }
    if (changed) this.emit("changed");
  }

  snapshot(): RevealSnapshot {
    return { nodes: new Set(this.nodes), headId: this.headId };
  }
}
