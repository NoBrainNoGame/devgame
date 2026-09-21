import { Footer } from "@/components/shell/Footer";

/**
 * The reading part of the site. Content scrolls, and the footer sits at the end
 * of it rather than being pinned — a permanently visible footer on a long page
 * is a band of wasted screen.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex-1">{children}</div>
      <Footer />
    </div>
  );
}
