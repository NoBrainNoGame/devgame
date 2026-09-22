import type { AppliedPayload } from "@/game/bridge/session";
import { gameStore } from "@/game/bridge/store";
import * as booyah from "@/game/chips/booyah";
import { sceneContext } from "@/game/chips/context";
import { Flash } from "@/game/chips/fx/Flash";
import { Look } from "@/game/chips/fx/Look";
import { Pop } from "@/game/chips/fx/Pop";
import { Reveal } from "@/game/chips/fx/Reveal";
import { Beat, type SkipFlag } from "@/game/chips/fx/skip";
import { planBatch, type Step } from "@/game/render/storyboard";

/**
 * Plays a turn's events one after another.
 *
 * The HUD updates the moment an action is applied, but the canvas is a story:
 * the commit appears, its cost lands on it, production catches fire. The
 * storyboard decides the order; Booyah's `Queue` plays it — each effect
 * terminates itself and the next one activates on the following tick — and
 * the reveal set is what lets the graph draw a commit only when its moment
 * comes.
 *
 * While the queue is draining, `pendingAnimation` is true, the session
 * refuses new actions and the dialogs stay shut. A click anywhere skips to
 * the end: everything is revealed at once and the UI unblocks.
 */

interface Batch {
  serial: number;
  skip: SkipFlag;
}

export class FxQueue extends booyah.Queue {
  private serial = 0;
  private current: Batch | null = null;

  protected _onActivate(): void {
    super._onActivate?.();

    const { session } = sceneContext(this.chipContext);
    this._subscribe(session, "applied", (...args: unknown[]) => {
      const payload = args[0] as AppliedPayload | undefined;
      if (payload !== undefined) this.enqueue(payload);
    });
  }

  /**
   * Cuts the rest of the sequence short. Every remaining effect ends the moment
   * it starts, the graph is completed on the spot, and the UI unblocks now.
   */
  skip(): void {
    const { reveal, session } = sceneContext(this.chipContext);
    if (this.current !== null) this.current.skip.value = true;
    reveal.showAll(session.getState());
    this.focus(null);
    gameStore.setState({ pendingAnimation: false });
  }

  private enqueue(payload: AppliedPayload): void {
    const { reveal, reducedMotion, translate } = sceneContext(this.chipContext);

    // One flag per batch. A skip on the previous batch must not cut this one
    // short, and this one's final step must not unblock a later one.
    this.serial += 1;
    const batch: Batch = { serial: this.serial, skip: { value: false } };
    this.current = batch;

    if (reducedMotion) {
      reveal.showAll(payload.state);
      this.add(new Beat(1, batch.skip));
    } else {
      const steps = planBatch(payload.events, payload.state, reveal.snapshot(), translate);
      for (const step of steps) this.add(this.chipFor(step, batch.skip));
    }

    this.add(
      new booyah.Lambda(() => {
        // A batch that was skipped and then followed by another must not be
        // the one that says "done".
        if (batch.serial !== this.serial) return;
        // Whatever the storyboard did not think to reveal, the end of the
        // batch does: the screen always ends a turn complete.
        reveal.showAll(sceneContext(this.chipContext).session.getState());
        this.focus(null);
        gameStore.setState({ pendingAnimation: false });
      }),
    );
  }

  private chipFor(step: Step, skip: SkipFlag): booyah.Chip {
    switch (step.kind) {
      case "reveal":
        return new Reveal(step.nodeId, step.at.y, step.asHead, step.hold, skip);
      case "look":
        return new Look(step.y, step.hold, skip);
      case "pop":
        return new Pop(step.at, step.caption, step.colour, step.hold, skip);
      case "flash":
        return new Flash(step.at, step.colour, step.hold, skip);
      case "beat":
        return new Beat(step.hold, skip);
    }
  }

  private focus(y: number | null): void {
    sceneContext(this.chipContext).controls.camera?.focusOn(y);
  }
}
