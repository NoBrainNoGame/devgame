"use client";

import { Bug, LogIn, LogOut, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { loginHref } from "@/lib/login-return";

/**
 * Just enough of the session to draw the menu. The full Better Auth session
 * carries the session token, and anything handed to a Client Component is
 * serialised into the page — so the header narrows it down to this first.
 */
export interface Viewer {
  name: string;
  email: string;
}

export function AuthMenu({ viewer }: { viewer: Viewer | null }): React.JSX.Element {
  const t = useTranslations("common");
  const nav = useTranslations("nav");
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);

  async function signOut(): Promise<void> {
    setBusy(true);
    await authClient.signOut();
    // The header is server-rendered, so the signed-out state only appears once
    // the route has been re-fetched.
    router.refresh();
    setBusy(false);
  }

  if (viewer === null) {
    return (
      <Button asChild variant="ghost" size="sm">
        <Link href={loginHref(pathname)}>
          <LogIn aria-hidden="true" />
          <span className="max-sm:sr-only">{t("signIn")}</span>
        </Link>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" disabled={busy}>
          <User aria-hidden="true" />
          <span className="max-w-24 truncate max-sm:sr-only">{viewer.name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground text-xs">
          {viewer.email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/report">
            <Bug aria-hidden="true" />
            {nav("report")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={busy} onSelect={() => void signOut()}>
          <LogOut aria-hidden="true" />
          {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
