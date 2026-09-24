"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { accountSkillPoints, type MetaProgressDto, type RunMode } from "@/game";
import { PROFILE_IDS, PROFILES } from "@/game/content";
import { cn } from "@/lib/utils";

/**
 * Choosing what kind of developer to be, and whether to play today's shared map.
 *
 * Locked starters are shown rather than hidden: the cost is the goal, and a
 * player who cannot see what banking commits buys has no reason to bank them.
 */
export interface RunSetupProps {
  meta: MetaProgressDto;
  dailyAvailable: boolean;
  resumable: boolean;
  /** Signed in, the account's name is the player's: nothing to ask. */
  signedIn: boolean;
  onStart: (choice: {
    profileId: MetaProgressDto["unlockedProfiles"][number];
    mode: RunMode;
    /** What the run calls you, signed out. Saved with the settings. */
    playerName: string;
  }) => void;
  onResume: () => void;
}

/** The longest name the settings keep, as `SettingsSchema` bounds it. */
const NAME_MAX = 24;

export function RunSetup({
  meta,
  dailyAvailable,
  resumable,
  signedIn,
  onStart,
  onResume,
}: RunSetupProps) {
  const t = useTranslations("play");
  const game = useTranslations("game");
  const common = useTranslations("common");

  const [profileId, setProfileId] = useState<MetaProgressDto["unlockedProfiles"][number]>(
    meta.unlockedProfiles[0] ?? "junior",
  );
  const [mode, setMode] = useState<RunMode>("classic");
  const [playerName, setPlayerName] = useState(meta.settings.playerName);
  const start = (): void =>
    onStart({ profileId, mode, playerName: playerName.trim().slice(0, NAME_MAX) });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="mb-1 font-medium text-xl">{t("title")}</h1>
      <p className="mb-8 text-muted-foreground text-sm">
        {common("commits")} {meta.commitsBank}
        {" · "}
        {t("startingPoints", { count: accountSkillPoints(meta.level) })}
      </p>

      {resumable ? (
        <Card className="mb-8 border-branch-feature/40">
          <CardHeader>
            <CardTitle className="text-base">{t("runInProgress")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Button onClick={onResume}>{t("resume")}</Button>
          </CardContent>
        </Card>
      ) : null}

      <section className="mb-8">
        <h2 className="mb-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
          {t("chooseProfile")}
        </h2>

        <div className="grid gap-2 sm:grid-cols-2">
          {PROFILE_IDS.map((id) => {
            const unlocked = meta.unlockedProfiles.includes(id);
            const selected = profileId === id;

            return (
              <button
                key={id}
                type="button"
                disabled={!unlocked}
                onClick={() => setProfileId(id)}
                className={cn(
                  "rounded-md border border-line bg-panel/40 p-3 text-left transition-colors",
                  unlocked ? "hover:border-branch-feature" : "opacity-50",
                  selected && "border-branch-feature bg-panel",
                )}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span>{game(`profiles.${id}.name` as never)}</span>
                  {unlocked ? null : (
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {PROFILES[id].unlockCost}
                    </Badge>
                  )}
                </span>
                <span className="mt-1 block text-muted-foreground text-xs">
                  {game(`profiles.${id}.desc` as never)}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
          {t("chooseMode")}
        </h2>

        <div className="grid gap-2 sm:grid-cols-2">
          <ModeButton
            label={t("modeClassic")}
            selected={mode === "classic"}
            onSelect={() => setMode("classic")}
          />
          <ModeButton
            label={t("modeDaily")}
            hint={t("modeDailyHint")}
            selected={mode === "daily"}
            disabled={!dailyAvailable}
            onSelect={() => setMode("daily")}
          />
        </div>
      </section>

      {signedIn ? null : (
        <section className="mb-8">
          <h2 className="mb-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
            {t("yourName")}
          </h2>
          <Input
            value={playerName}
            maxLength={NAME_MAX}
            placeholder={t("yourNamePlaceholder")}
            autoComplete="nickname"
            className="max-w-xs"
            onChange={(event) => setPlayerName(event.target.value)}
            // Typing a name and pressing Enter is the whole ceremony.
            onKeyDown={(event) => {
              if (event.key === "Enter") start();
            }}
          />
        </section>
      )}

      <Button size="lg" onClick={start}>
        {t("start")}
      </Button>
    </div>
  );
}

function ModeButton({
  label,
  hint,
  selected,
  disabled,
  onSelect,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "rounded-md border border-line bg-panel/40 p-3 text-left transition-colors",
        disabled ? "opacity-50" : "hover:border-branch-feature",
        selected && "border-branch-feature bg-panel",
      )}
    >
      <span className="block">{label}</span>
      {hint === undefined ? null : (
        <span className="mt-1 block text-muted-foreground text-xs">{hint}</span>
      )}
    </button>
  );
}
