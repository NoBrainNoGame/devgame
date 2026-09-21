/**
 * The playing part of the site: exactly the height the header leaves, and no
 * page scroll at all. The canvas sizes itself against this, so a scrollbar here
 * would mean the graph is taller than the window and the HUD is off-screen.
 *
 * No footer, deliberately — a run should not have a colophon under it.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>;
}
