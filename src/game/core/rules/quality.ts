import { BALANCE } from "@/game/core/balance";
import { emit, type RuleContext } from "@/game/core/rules/context";
import { gameOver } from "@/game/core/rules/over";
import type { QualitySource } from "@/game/core/types";

/**
 * Production's patience. It fills on incidents, on refused pull requests, on
 * the backlog you let rot, on saturated servers and on sprints you sat out;
 * it empties a little on every clean sprint; and full is the sack — the
 * ending that says the work got away from you, as opposed to burnout, which
 * says you got away from yourself.
 *
 * Every change names its source. The log line, the canvas pop and the
 * run-over screen all come from that name, which is what keeps "why did I
 * lose" answerable.
 */
export function raiseQuality(context: RuleContext, amount: number, source: QualitySource): void {
  const { state } = context;
  const before = state.quality;
  state.quality = Math.min(BALANCE.quality.max, before + amount);

  const applied = state.quality - before;
  if (applied !== 0) {
    state.stats.qualityBySource[source] += applied;
    state.stats.lastQualitySource = source;
    emit(context, {
      type: "quality",
      delta: applied,
      value: state.quality,
      max: BALANCE.quality.max,
      source,
    });
  }
  // Checked even when nothing moved: a gauge already full is a run already
  // over, whatever overwrote the phase since.
  if (state.quality >= BALANCE.quality.max) gameOver(context, "fired", source);
}

/** A clean sprint earns some patience back. */
export function lowerQuality(
  context: RuleContext,
  amount: number,
  source: "clean_sprint" | "hack" | "client_bug" | "event" = "clean_sprint",
): void {
  const { state } = context;
  const before = state.quality;
  state.quality = Math.max(0, before - amount);
  if (state.quality === before) return;

  emit(context, {
    type: "quality",
    delta: state.quality - before,
    value: state.quality,
    max: BALANCE.quality.max,
    source,
  });
}
