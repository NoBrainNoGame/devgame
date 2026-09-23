import { TENSION } from "@/game/audio/manifest";
import * as booyah from "@/game/chips/booyah";
import { sceneContext } from "@/game/chips/context";
import { BALANCE } from "@/game/core/balance";
import { playerTickets } from "@/game/core/rules/tickets";

/**
 * Drives the ambience from the run: one layer per ticket held beside the
 * first, and a tension that is six tenths the tier and four tenths
 * production's patience. Says something to the audio only when it changes.
 */
export class Ambient extends booyah.ChipBase {
  private layers = -1;
  private tension = -1;

  protected _onTick(): void {
    const { session, audio } = sceneContext(this.chipContext);
    const state = session.getState();
    const layers = Math.max(0, playerTickets(state).length - 1);
    const tension =
      TENSION.tierWeight * (state.tier / BALANCE.economy.tier.last) +
      TENSION.qualityWeight * (state.quality / BALANCE.quality.max);
    const rounded = Math.round(tension * 100) / 100;
    if (layers !== this.layers) {
      this.layers = layers;
      audio.setAmbientLayers(layers);
    }
    if (rounded !== this.tension) {
      this.tension = rounded;
      audio.setTension(rounded);
    }
  }
}
