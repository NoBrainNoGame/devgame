"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { ConnectionBanner } from "@/components/multi/connection";
import { useRealtimeErrors } from "@/components/multi/errors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link, useRouter } from "@/i18n/navigation";
import { realtimeClient } from "@/realtime/client/instance";
import { useRealtime } from "@/realtime/client/store";

/**
 * Where a player picks a company: one with a free seat, one of their own, or
 * the list of those waiting to be recruited. The world's state arrives over
 * the socket and this only draws it; every button asks the server, which
 * decides. A player who gets a seat — by joining, founding, or being
 * recruited from the waiting list — is carried to the stage.
 */
export function Lobby({ userName }: { userName: string }): React.JSX.Element {
  const t = useTranslations("multi.lobby");
  const router = useRouter();
  const lobby = useRealtime((state) => state.lobby);
  const join = useRealtime((state) => state.join);
  const closed = useRealtime((state) => state.closed);
  const connection = useRealtime((state) => state.connection);
  const me = useRealtime((state) => state.me);
  const [name, setName] = useState("");
  useRealtimeErrors();

  useEffect(() => {
    if (join !== null && closed === null) router.replace("/multi/play");
  }, [join, closed, router]);

  const open = connection === "open";
  const client = realtimeClient();

  return (
    <div className="relative min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <ConnectionBanner />
      <div className="mx-auto max-w-3xl space-y-6 pt-8">
        <header className="space-y-1">
          <h1 className="font-display font-bold text-2xl text-cyber uppercase tracking-[0.12em]">
            {t("title")}
          </h1>
          <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
          <p className="text-muted-foreground text-xs">
            {t("signedAs", { name: me?.name ?? userName })}
          </p>
        </header>

        <section className="space-y-2 border border-line bg-panel/40 p-4">
          <h2 className="hud-title font-medium text-muted-foreground text-xs uppercase tracking-wider">
            {t("createTitle")}
          </h2>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (client.createCompany(name.trim())) setName("");
            }}
          >
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("createPlaceholder")}
              maxLength={24}
              aria-label={t("createTitle")}
            />
            <Button type="submit" disabled={!open || name.trim().length < 3}>
              {t("create")}
            </Button>
          </form>
        </section>

        <section className="space-y-2">
          <h2 className="hud-title font-medium text-muted-foreground text-xs uppercase tracking-wider">
            {t("companies")}
          </h2>
          {lobby === null || lobby.companies.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("noCompanies")}</p>
          ) : (
            <ul className="space-y-2">
              {lobby.companies.map((company) => (
                <li
                  key={company.id}
                  className="flex flex-wrap items-center gap-3 border border-line bg-panel/40 p-3"
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{company.name}</span>
                  <Badge variant="secondary">{t("rank", { rank: company.rank })}</Badge>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {t("score", { score: company.score })}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {t("members", { count: company.members })} ·{" "}
                    {t("freeSeats", { count: company.freeSeats })}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!open || company.freeSeats === 0}
                    onClick={() => client.joinCompany(company.id)}
                  >
                    {company.freeSeats === 0 ? t("full") : t("join")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="hud-title font-medium text-muted-foreground text-xs uppercase tracking-wider">
            {t("waitingTitle")}
          </h2>
          {lobby === null || lobby.waiting.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("noWaiting")}</p>
          ) : (
            <ul className="flex flex-wrap gap-2 text-sm">
              {lobby.waiting.map((player) => (
                <li key={player.profileId} className="border border-line px-2 py-1">
                  {player.name}
                </li>
              ))}
            </ul>
          )}
          {lobby?.waitingYou === true ? (
            <>
              <p className="text-muted-foreground text-xs">{t("waitingYou")}</p>
              <Button size="sm" variant="ghost" onClick={() => client.unwait()}>
                {t("unwait")}
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" disabled={!open} onClick={() => client.wait()}>
              {t("waitMe")}
            </Button>
          )}
        </section>

        <footer className="flex flex-wrap gap-4 text-sm">
          <Link href="/multi/leaderboard" className="text-cyber underline-offset-4 hover:underline">
            {t("leaderboard")}
          </Link>
          <Link href="/play" className="text-muted-foreground underline-offset-4 hover:underline">
            {t("soloLink")}
          </Link>
        </footer>
      </div>
    </div>
  );
}
