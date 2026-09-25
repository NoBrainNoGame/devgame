"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * Where toasts land: top centre, under the header and the run's bars, over
 * the graph — the one place that hides no control and that the eye crosses
 * every turn. Every toast stays until dealt with (`notify`), so they are all
 * shown, never stacked out of sight. The toasts draw themselves (`notify`);
 * this only places them.
 */
const Toaster = (props: ToasterProps) => (
  <Sonner
    position="top-center"
    offset={{ top: "10.5rem" }}
    mobileOffset={{ top: "4.5rem" }}
    expand
    visibleToasts={5}
    gap={10}
    {...props}
  />
);

export { Toaster };
