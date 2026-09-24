"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import { submitBugReport } from "@/lib/report/actions";
import { REPORT_LIMITS } from "@/lib/report/validate";

/** One of the player's recent runs, as the seed picker lists it. */
export interface RecentRun {
  seed: string;
  /** The seed, the date, and "daily" when it was one: already in the page's language. */
  label: string;
}

/** The picker's value for a seed typed by hand rather than picked. */
const OTHER = "\u0000other";

/**
 * The form. The limits here are a convenience; the action validates again.
 * The run is a pick among the player's last few, with a way to type another
 * seed; a report is about the game, so there is no page to name. Two fields
 * a person never touches — a honeypot kept off screen, and the time the
 * form was opened — are what tells a bot from a player.
 */
export function ReportForm({ recent }: { recent: RecentRun[] }): React.JSX.Element {
  const t = useTranslations("report");
  const errors = useTranslations("errors");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [startedAt] = useState(() => Date.now());
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pick, setPick] = useState<string>(recent[0]?.seed ?? "");
  const [typed, setTyped] = useState("");
  const [website, setWebsite] = useState("");
  const seed = pick === OTHER ? typed : pick;

  function onSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    startTransition(async () => {
      const result = await submitBugReport({ title, body, seed, website, startedAt });
      if (!result.ok) {
        toast.error(errors(result.error.code));
        return;
      }
      toast.success(t("sent"));
      setTitle("");
      setBody("");
      setTyped("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="report-title" className="text-muted-foreground text-xs">
          {t("fieldTitle")}
        </Label>
        <Input
          id="report-title"
          value={title}
          minLength={REPORT_LIMITS.title.min}
          maxLength={REPORT_LIMITS.title.max}
          required
          disabled={pending}
          onChange={(event) => setTitle(event.target.value)}
          className="font-mono"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="report-body" className="text-muted-foreground text-xs">
          {t("fieldBody")}
        </Label>
        <textarea
          id="report-body"
          value={body}
          minLength={REPORT_LIMITS.body.min}
          maxLength={REPORT_LIMITS.body.max}
          required
          rows={8}
          disabled={pending}
          onChange={(event) => setBody(event.target.value)}
          className="cyber-clip w-full border border-cyber/40 bg-panel/60 px-3 py-2 font-mono text-sm outline-none [--cyber-corner:8px] focus-visible:border-cyber focus-visible:bg-panel"
        />
        <p className="text-muted-foreground text-xs tabular-nums">
          {body.length}/{REPORT_LIMITS.body.max}
        </p>
      </div>
      <div className="grid gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="report-run" className="text-muted-foreground text-xs">
            {t("fieldRun")}
          </Label>
          <select
            id="report-run"
            value={pick}
            disabled={pending}
            onChange={(event) => setPick(event.target.value)}
            className="cyber-clip h-9 w-full border border-cyber/40 bg-panel/60 px-3 font-mono text-sm outline-none [--cyber-corner:8px] focus-visible:border-cyber"
          >
            <option value="">{t("runNone")}</option>
            {recent.map((run) => (
              <option key={run.seed} value={run.seed}>
                {run.label}
              </option>
            ))}
            <option value={OTHER}>{t("runOther")}</option>
          </select>
        </div>
        {pick === OTHER ? (
          <div className="max-w-sm space-y-1.5">
            <Label htmlFor="report-seed" className="text-muted-foreground text-xs">
              {t("fieldSeed")}
            </Label>
            <Input
              id="report-seed"
              value={typed}
              maxLength={REPORT_LIMITS.seed}
              pattern="[0-9a-zA-Z_-]*"
              disabled={pending}
              onChange={(event) => setTyped(event.target.value)}
              className="font-mono"
            />
          </div>
        ) : null}
      </div>
      {/* Off screen, not hidden: a bot that reads styles still fills what it finds. */}
      <div aria-hidden="true" className="absolute -left-[9999px] top-0 h-px w-px overflow-hidden">
        <label htmlFor="report-website">Website</label>
        <input
          id="report-website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
        />
      </div>
      <Button type="submit" disabled={pending || title.length < REPORT_LIMITS.title.min}>
        {t("send")}
      </Button>
    </form>
  );
}
