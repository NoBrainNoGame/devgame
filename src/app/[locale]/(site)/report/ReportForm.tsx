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
import { KNOWN_PATHS } from "@/lib/visits/paths";

/**
 * The form. The limits here are a convenience; the action validates again.
 * Two fields a person never touches — a honeypot kept off screen, and the
 * time the form was opened — are what tells a bot from a player.
 */
export function ReportForm(): React.JSX.Element {
  const t = useTranslations("report");
  const errors = useTranslations("errors");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [startedAt] = useState(() => Date.now());
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [page, setPage] = useState<string>("");
  const [seed, setSeed] = useState("");
  const [website, setWebsite] = useState("");

  function onSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    startTransition(async () => {
      const result = await submitBugReport({
        title,
        body,
        ...(page === "" ? {} : { page }),
        seed,
        website,
        startedAt,
      });
      if (!result.ok) {
        toast.error(errors(result.error.code));
        return;
      }
      toast.success(t("sent"));
      setTitle("");
      setBody("");
      setSeed("");
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
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <p className="text-muted-foreground text-xs tabular-nums">
          {body.length}/{REPORT_LIMITS.body.max}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="report-page" className="text-muted-foreground text-xs">
            {t("fieldPage")}
          </Label>
          <select
            id="report-page"
            value={page}
            disabled={pending}
            onChange={(event) => setPage(event.target.value)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 font-mono text-sm"
          >
            <option value="">{t("pageAny")}</option>
            {KNOWN_PATHS.filter((path) => path !== "/other").map((path) => (
              <option key={path} value={path}>
                {path}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="report-seed" className="text-muted-foreground text-xs">
            {t("fieldSeed")}
          </Label>
          <Input
            id="report-seed"
            value={seed}
            maxLength={REPORT_LIMITS.seed}
            pattern="[0-9a-zA-Z_-]*"
            disabled={pending}
            onChange={(event) => setSeed(event.target.value)}
            className="font-mono"
          />
        </div>
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
