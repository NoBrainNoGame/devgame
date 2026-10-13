"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { realtimeClient } from "@/realtime/client/instance";
import { useRealtime } from "@/realtime/client/store";

/**
 * Holds the connection open for as long as a multiplayer screen is on show.
 * The lobby and the stage each mount one; the client counts them, so moving
 * from one to the other never drops the socket.
 */
export function RealtimeConnection({ children }: { children: React.ReactNode }): React.JSX.Element {
  useEffect(() => {
    const client = realtimeClient();
    client.retain();
    return () => client.release();
  }, []);
  return <>{children}</>;
}

/**
 * What the connection is doing, said over the stage like the WebGL-lost note:
 * nothing while it is open, a line while it is coming back, and what to do
 * when it is not coming back.
 */
export function ConnectionBanner({ className }: { className?: string }): React.JSX.Element | null {
  const t = useTranslations("multi.connection");
  const connection = useRealtime((state) => state.connection);
  const attempt = useRealtime((state) => state.attempt);
  if (connection === "open" || connection === "idle") return null;

  const closed = connection === "closed";
  const outdated = connection === "outdated";
  const text =
    connection === "connecting"
      ? t("connecting")
      : connection === "reconnecting"
        ? t("reconnecting", { attempt: Math.max(1, attempt) })
        : closed
          ? t("closed")
          : outdated
            ? t("outdated")
            : t("disabled");

  return (
    <p
      role="status"
      className={cn(
        "absolute inset-x-3 top-3 z-20 flex flex-wrap items-center justify-center gap-3 border border-debt/60 bg-panel/90 px-3 py-2 text-center text-debt text-xs leading-relaxed backdrop-blur-sm",
        className,
      )}
    >
      <span>{text}</span>
      {closed ? (
        <Button asChild size="xs" variant="outline">
          <Link href="/login">{t("signIn")}</Link>
        </Button>
      ) : null}
      {outdated ? (
        <Button size="xs" variant="outline" onClick={() => window.location.reload()}>
          {t("reload")}
        </Button>
      ) : null}
    </p>
  );
}
