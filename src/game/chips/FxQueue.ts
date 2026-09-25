import { clearHeld, cueKey, emitGaugeCue, releaseUncued } from "@/game/bridge/gaugeCues";
import { isShopAction } from "@/game/bridge/gauges";
import type { AppliedPayload } from "@/game/bridge/session";
import { gameStore } from "@/game/bridge/store";
import * as booyah from "@/game/chips/booyah";
import { sceneContext } from "@/game/chips/context";
import { Flash } from "@/game/chips/fx/Flash";
import { Look } from "@/game/chips/fx/Look";
import { Pop } from "@/game/chips/fx/Pop";
import { Reveal } from "@/game/chips/fx/Reveal";
import { Sfx } from "@/game/chips/fx/Sfx";
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
 *
 * A watchdog on the wall clock backs that up: a batch that has not said
 * "done" long after the longest story could have played — a ticker paused
 * by a hidden tab, a chip that never terminated — is skipped on its own.
 * A flag that stays up is a game where nothing can be bought or written,
 * and that must never depend on the player guessing to click the canvas.
 */

interface Batch {
  serial: number;
  skip: SkipFlag;
}

/** Longer than any storyboard, shorter than a player's patience. */
const WATCHDOG_MS = 8_000;
/** Long enough for the HUD's balls to land (`gaugeFxMath.ts`), rendering only. */
const DIALOG_FLIGHT_MS = 520;

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
    // Tied to the scene's signal, not to this chip's teardown: a scene that
    // threw in a frame never terminates its chips.
    document.addEventListener("visibilitychange", this.onVisibility, {
      signal: sceneContext(this.chipContext).signal,
    });
  }

  // A hidden tab draws no frames, so no effect would ever end: the story is
  // cut to its last frame, and the idle clock keeps playing behind it.
  private readonly onVisibility = (): void => {
    if (document.hidden && gameStore.getState().pendingAnimation) this.skip();
  };

  /**
   * Cuts the rest of the sequence short. Every remaining effect ends the moment
   * it starts, the graph is completed on the spot, and the UI unblocks now.
   */
  skip(): void {
    const { reveal, session } = sceneContext(this.chipContext);
    if (this.current !== null) this.current.skip.value = true;
    reveal.showAll(session.getState());
    this.focus(null);
    clearHeld();
    gameStore.setState({ pendingAnimation: false });
  }

  private enqueue(payload: AppliedPayload): void {
    const { reveal, reducedMotion, translate, pops, interactive } = sceneContext(this.chipContext);

    // One flag per batch. A skip on the previous batch must not cut this one
    // short, and this one's final step must not unblock a later one.
    this.serial += 1;
    const batch: Batch = { serial: this.serial, skip: { value: false } };
    this.current = batch;
    const { signal, audio } = sceneContext(this.chipContext);
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const arm = (): void => {
      watchdog = setTimeout(() => {
        if (signal.aborted) return;
        if (batch.serial !== this.serial || !gameStore.getState().pendingAnimation) return;
        // Held still under a modal is not stuck: wait for it to close.
        if (sceneContext(this.chipContext).paused()) {
          arm();
          return;
        }
        this.skip();
      }, WATCHDOG_MS);
    };
    arm();

    if (reducedMotion) {
      reveal.showAll(payload.state);
      // Nothing moves, but a sound is not a motion: it plays at once.
      for (const step of planBatch(payload.events, payload.state, reveal.snapshot(), translate)) {
        if (step.kind === "sfx") audio.play(step.id);
      }
      this.add(new Beat(1, batch.skip));
    } else {
      // A review's hold is for its dialog, which only a played run opens. A
      // purchase shows its own price; the canvas has no money to raise.
      const steps = planBatch(payload.events, payload.state, reveal.snapshot(), translate, {
        reviewHold: interactive,
        economyPops: !isShopAction(payload.action),
      });
      const cued = new Set<string>();
      for (const step of steps) {
        if (step.kind === "pop" && step.cue !== undefined && payload.origin !== undefined) {
          // Taken in a dialog: what it gives flies from there, at once, and
          // the canvas under the dialog does not repeat it.
          cued.add(cueKey(step.cue));
          emitGaugeCue({
            cue: step.cue,
            batch: payload.batch,
            from: payload.origin,
            colour: step.colour,
          });
          continue;
        }
        if (step.kind === "pop" && !pops) continue;
        if (step.kind === "pop" && step.cue !== undefined) cued.add(cueKey(step.cue));
        this.add(this.chipFor(step, batch.skip, payload.batch));
      }
      // A figure that will never rise — its commit never shown, pops off —
      // moves nothing: its gauge shows the run now.
      releaseUncued(payload.batch, cued);
      // Figures flying from a dialog land before the story says it is over.
      if (payload.origin !== undefined && cued.size > 0) {
        this.add(new Beat(DIALOG_FLIGHT_MS, batch.skip));
      }
    }

    this.add(
      new booyah.Lambda(() => {
        // A batch that was skipped and then followed by another must not be
        // the one that says "done".
        clearTimeout(watchdog);
        if (batch.serial !== this.serial) return;
        clearHeld();
        // Whatever the storyboard did not think to reveal, the end of the
        // batch does: the screen always ends a turn complete.
        reveal.showAll(sceneContext(this.chipContext).session.getState());
        this.focus(null);
        gameStore.setState({ pendingAnimation: false });
      }),
    );
    if (document.hidden) this.skip();
  }

  /** Under a modal, the story holds still: nothing advances until it closes. */
  tick(tickInfo: booyah.TickInfo): void {
    if (sceneContext(this.chipContext).paused()) return;
    super.tick(tickInfo);
  }

  private chipFor(step: Step, skip: SkipFlag, batch: number): booyah.Chip {
    switch (step.kind) {
      case "reveal":
        return new Reveal(step.nodeId, step.at.y, step.asHead, step.hold, skip);
      case "look":
        return new Look(step.y, step.hold, skip);
      case "pop":
        return new Pop(
          step.at,
          step.caption,
          step.colour,
          step.hold,
          skip,
          step.cue === undefined ? undefined : { cue: step.cue, batch },
        );
      case "flash":
        return new Flash(step.at, step.colour, step.hold, skip);
      case "beat":
        return new Beat(step.hold, skip);
      case "sfx":
        return new Sfx(step.id, skip);
    }
  }

  private focus(y: number | null): void {
    sceneContext(this.chipContext).controls.camera?.focusOn(y);
  }
}
