"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { GameSettingsButton } from "@/components/settings/GameSettings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { accountSkillPoints, type MetaProgressDto, type RunMode, type RunSaveDto } from "@/game";
import { PROFILE_IDS, PROFILES } from "@/game/content";
import { cn } from "@/lib/utils";

import { ResumePanel } from "./ResumePanel";

/**
 * Choosing what kind of developer to be, and whether to play today's shared map.
 *
 * Locked starters are shown rather than hidden: the cost is the goal, and a
 * player who cannot see what banking commits buys has no reason to bank them.
 *
 * A run left in progress takes the first place, drawn as it stands, and
 * starting another over it asks first: the new run replaces the save, and
 * the old one cannot be resumed after.
 */
export interface RunSetupProps {
  meta: MetaProgressDto;
  dailyAvailable: boolean;
  /** The run left in progress, if any. */
  resumable: RunSaveDto | null;
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
  const [confirming, setConfirming] = useState(false);
  const start = (): void =>
    onStart({ profileId, mode, playerName: playerName.trim().slice(0, NAME_MAX) });
  // A run in progress is one click from gone: the new one takes its save.
  const requestStart = (): void => {
    if (resumable === null) start();
    else setConfirming(true);
  };

  const form = (
    <div className="min-w-0">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h1 className="font-medium text-xl">{t("title")}</h1>
        <GameSettingsButton />
      </div>
      <p className="mb-8 text-muted-foreground text-sm">
        {common("commits")} {meta.commitsBank}
        {" · "}
        {t("startingPoints", { count: accountSkillPoints(meta.level) })}
      </p>

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
              if (event.key === "Enter") requestStart();
            }}
          />
        </section>
      )}

      <Button size="lg" variant={resumable === null ? "default" : "outline"} onClick={requestStart}>
        {t("start")}
      </Button>
    </div>
  );

  return (
    // The run's area never scrolls; this screen may, inside it, on a short window.
    <div className="min-h-0 flex-1 overflow-y-auto">
      {resumable === null ? (
        <div className="mx-auto w-full max-w-3xl px-4 py-10">{form}</div>
      ) : (
        <div className="mx-auto grid w-full max-w-[96rem] gap-8 px-4 py-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <ResumePanel save={resumable} onResume={onResume} />
          {form}
        </div>
      )}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("confirmNewTitle")}</DialogTitle>
            <DialogDescription>{t("confirmNewBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              {common("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirming(false);
                start();
              }}
            >
              {t("confirmNewAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
