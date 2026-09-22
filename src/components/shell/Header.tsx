import { getTranslations } from "next-intl/server";

import { AuthMenu, type Viewer } from "@/components/shell/AuthMenu";
import { LocaleSwitch } from "@/components/shell/LocaleSwitch";
import { Link } from "@/i18n/navigation";
import { env } from "@/lib/env";
import { getSession } from "@/lib/session";

/**
 * The top bar. It reads the session here, once, and hands the pieces down —
 * so the menu never has to fetch anything and the signed-in state is correct
 * on the first paint rather than after a flash of "sign in".
 */
export async function Header(): Promise<React.JSX.Element> {
  const [common, nav, session] = await Promise.all([
    getTranslations("common"),
    getTranslations("nav"),
    getSession(),
  ]);

  const viewer: Viewer | null =
    session === null ? null : { name: session.user.name, email: session.user.email };

  // Offline there is no account to have: the profile link and the sign-in
  // button would lead to pages that do not exist on this instance.
  const links = [
    { href: "/play", label: nav("play") },
    { href: "/leaderboard", label: nav("leaderboard") },
    ...(env.ONLINE ? [{ href: "/profile", label: nav("profile") }] : []),
  ] as const;

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-line border-b bg-panel/40 px-3 sm:gap-5 sm:px-4">
      <Link
        href="/"
        className="shrink-0 font-semibold text-sm transition-colors hover:text-branch-main"
      >
        {common("appName")}
      </Link>

      <nav className="flex min-w-0 items-center gap-3 text-xs sm:gap-4 sm:text-sm">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground"
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
        <LocaleSwitch />
        {env.ONLINE ? <AuthMenu viewer={viewer} /> : null}
      </div>
    </header>
  );
}
