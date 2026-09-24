/**
 * The reading part of the site: content scrolls under the header, above the
 * footer the root layout pins to the bottom of the window.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>;
}
