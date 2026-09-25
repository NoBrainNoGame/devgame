import type { MouseEvent } from "react";

import type { PlayerAction } from "@/game";

/** A point on the page, in client coordinates. */
export interface PagePoint {
  x: number;
  y: number;
}

/**
 * How the HUD acts. `origin` is where the action was taken, when it was taken
 * in a dialog over the canvas: what it gives flies from there to the gauges.
 */
export type OnAct = (action: PlayerAction, origin?: PagePoint) => void;

/** The centre of the control that was pressed. */
export function originOf(event: MouseEvent<HTMLElement>): PagePoint {
  const box = event.currentTarget.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}
