"use client";

import { Download, ExternalLink, Settings, Upload } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";

import { useSettings } from "@/components/settings/useSettings";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { parseSaveFile, SAVE_FILE_MAX_BYTES, type SaveFileDto } from "@/game/dto/saveFile";
import { RULES_FINGERPRINT } from "@/game/dto/version";
import { BUILT_WITH, CREDITS } from "@/lib/credits";
import { LINKS } from "@/lib/links";
import { pushRun, readLocalRun, writeLocalRun } from "@/lib/storage/sync";
import { exportSave, type ImportPlan, planImport, saveFileName } from "@/lib/storage/transfer";
import { useMetaStore } from "@/lib/storage/useMetaStore";
import { cn } from "@/lib/utils";

/**
 * The game's settings, one button away on the run's page and on the screen
 * before it: the sound, the motion, the save carried in and out, and who made
 * the game. Everything is written to the account's settings the moment it
 * changes; there is no "save" button to forget.
 */
export function GameSettingsButton({ className }: { className?: string }) {
  const t = useTranslations("settings");
  const [open, setOpen] = useState(false);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon-sm"
            variant="outline"
            className={cn("shrink-0", className)}
            aria-label={t("open")}
            onClick={() => setOpen(true)}
          >
            <Settings className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("open")}</TooltipContent>
      </Tooltip>
      <GameSettingsDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function GameSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("settings");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("hint")}</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="sound">
          <TabsList variant="line">
            <TabsTrigger value="sound">{t("tabs.sound")}</TabsTrigger>
            <TabsTrigger value="display">{t("tabs.display")}</TabsTrigger>
            <TabsTrigger value="save">{t("tabs.save")}</TabsTrigger>
            <TabsTrigger value="credits">{t("tabs.credits")}</TabsTrigger>
          </TabsList>
          <TabsContent value="sound" className="pt-4">
            <SoundTab />
          </TabsContent>
          <TabsContent value="display" className="pt-4">
            <DisplayTab />
          </TabsContent>
          <TabsContent value="save" className="pt-4">
            <SaveTab />
          </TabsContent>
          <TabsContent value="credits" className="pt-4">
            <CreditsTab />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function SoundTab() {
  const t = useTranslations("settings");
  const { settings, update } = useSettings();

  return (
    <div className="space-y-5">
      <Toggle
        label={t("sound")}
        hint={t("soundHint")}
        checked={settings.sound}
        onChange={(sound) => update({ sound })}
      />
      <Level
        label={t("music")}
        value={settings.musicVolume}
        disabled={!settings.sound}
        onChange={(musicVolume) => update({ musicVolume })}
      />
      <Level
        label={t("sfx")}
        value={settings.sfxVolume}
        disabled={!settings.sound}
        onChange={(sfxVolume) => update({ sfxVolume })}
      />
      {/* No sound ships yet: the levels are kept for the day it does. */}
      <p className="text-muted-foreground text-xs">{t("audioSoon")}</p>
    </div>
  );
}

function DisplayTab() {
  const t = useTranslations("settings");
  const { settings, update } = useSettings();

  return (
    <div className="space-y-5">
      <Toggle
        label={t("reducedMotion")}
        hint={t("reducedMotionHint")}
        checked={settings.reducedMotion}
        onChange={(reducedMotion) => update({ reducedMotion })}
      />
    </div>
  );
}

type ImportState =
  | { kind: "idle" }
  | { kind: "error"; reason: "too_large" | "not_json" | "not_a_save" }
  | { kind: "pending"; file: SaveFileDto; plan: ImportPlan };

function SaveTab() {
  const t = useTranslations("settings");
  const format = useFormatter();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<ImportState>({ kind: "idle" });
  const [importing, setImporting] = useState(false);

  const download = (): void => {
    const now = new Date().toISOString();
    const file = exportSave(useMetaStore.getState().meta, readLocalRun(), now);
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = saveFileName(now);
    link.click();
    // After the click has handed the file to the browser, not before.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const choose = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const picked = event.target.files?.[0];
    // The same file picked twice must fire twice.
    event.target.value = "";
    if (picked === undefined) return;
    if (picked.size > SAVE_FILE_MAX_BYTES) {
      setState({ kind: "error", reason: "too_large" });
      return;
    }
    const parsed = parseSaveFile(await picked.text());
    if (!parsed.ok) {
      setState({ kind: "error", reason: parsed.reason });
      return;
    }
    const plan = planImport(
      { meta: useMetaStore.getState().meta, run: readLocalRun() },
      parsed.file,
    );
    setState({ kind: "pending", file: parsed.file, plan });
  };

  const apply = async (plan: ImportPlan): Promise<void> => {
    setImporting(true);
    // The account's copy first, so the reload does not bring back the run the
    // cloud still held. Silent when signed out or offline, like every push.
    if (plan.run !== null) {
      try {
        await pushRun(plan.run);
      } catch {
        // The local copy is the record; the cloud catches up at the next save.
      }
    }
    useMetaStore.getState().setMeta(plan.meta);
    if (plan.run !== null) writeLocalRun(plan.run);
    // A run on screen would save itself over the import at its next move:
    // the page starts again from the save instead.
    window.location.reload();
  };

  return (
    <div className="space-y-6 text-sm">
      <section className="space-y-2">
        <h3 className="font-medium">{t("export")}</h3>
        <p className="text-muted-foreground text-xs">{t("exportHint")}</p>
        <Button size="sm" variant="outline" onClick={download}>
          <Download className="size-4" />
          {t("exportAction")}
        </Button>
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">{t("import")}</h3>
        <p className="text-muted-foreground text-xs">{t("importHint")}</p>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => void choose(event)}
        />
        <Button size="sm" variant="outline" onClick={() => input.current?.click()}>
          <Upload className="size-4" />
          {t("importAction")}
        </Button>

        {state.kind === "error" ? (
          <p role="alert" className="text-branch-hotfix text-xs">
            {t(`importError.${state.reason}`)}
          </p>
        ) : null}

        {state.kind === "pending" ? (
          <div className="space-y-3 border border-line bg-panel/60 p-3">
            <p>
              {t("importSummary", {
                date: format.dateTime(new Date(state.file.exportedAt), {
                  dateStyle: "medium",
                  timeStyle: "short",
                }),
                level: state.file.meta.level,
                commits: state.file.meta.commitsBank,
              })}
            </p>
            <p className="text-muted-foreground text-xs">
              {state.file.run === null
                ? t("importNoRun")
                : t("importRun", { count: state.file.run.actions.length })}
            </p>
            <p className="text-muted-foreground text-xs">{t("importMerge")}</p>
            {state.plan.replacesRun ? (
              <p className="text-branch-hotfix text-xs">{t("importReplacesRun")}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={importing} onClick={() => void apply(state.plan)}>
                {t("importConfirm")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={importing}
                onClick={() => setState({ kind: "idle" })}
              >
                {t("importCancel")}
              </Button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function CreditsTab() {
  const t = useTranslations("settings");
  const footer = useTranslations("footer");

  return (
    <div className="space-y-5 text-sm">
      <dl className="space-y-3">
        {CREDITS.map((credit) => (
          <div key={credit.role}>
            <dt className="text-muted-foreground text-xs uppercase tracking-wider">
              {t(`credits.roles.${credit.role}`)}
              {credit.upcoming ? ` · ${t("credits.upcoming")}` : ""}
            </dt>
            <dd>
              {credit.href === undefined ? (
                credit.name
              ) : (
                <a
                  href={credit.href}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-1 transition-colors hover:text-branch-main"
                >
                  {credit.name}
                  <ExternalLink aria-hidden="true" className="size-3" />
                </a>
              )}
            </dd>
          </div>
        ))}
      </dl>

      <p className="text-muted-foreground text-xs">
        {t("credits.builtWith", { tools: BUILT_WITH.join(", ") })}
      </p>

      <nav className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <a
          href={LINKS.repository}
          target="_blank"
          rel="noopener"
          className="hover:text-branch-main"
        >
          {footer("source")}
        </a>
        <a href={LINKS.support} target="_blank" rel="noopener" className="hover:text-branch-main">
          {footer("support")}
        </a>
        <a href={LINKS.contact} className="hover:text-branch-main">
          {footer("contact")}
        </a>
      </nav>

      <p className="text-muted-foreground text-xs tabular-nums">
        {t("credits.rules", { fingerprint: RULES_FINGERPRINT })}
      </p>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-sm">
          {label}
        </label>
        <p className="text-muted-foreground text-xs">{hint}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
          checked ? "border-branch-main bg-branch-main/30" : "border-line bg-panel",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-0.5 left-0.5 size-3.5 rounded-full transition-transform",
            checked ? "translate-x-4 bg-branch-main" : "bg-muted-foreground",
          )}
        />
      </button>
    </div>
  );
}

function Level({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className={cn("space-y-1.5", disabled && "opacity-50")}>
      <div className="flex items-baseline justify-between text-sm">
        <label htmlFor={id}>{label}</label>
        <span className="text-muted-foreground text-xs tabular-nums">{value} %</span>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-branch-main"
      />
    </div>
  );
}
