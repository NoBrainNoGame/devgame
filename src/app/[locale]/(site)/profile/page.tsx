import { getLocale, getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { emptyMeta, xpForLevel } from "@/game";
import { redirect } from "@/i18n/navigation";
import { prisma } from "@/lib/db";
import { getMyProfile } from "@/lib/profile/actions";
import { getSession } from "@/lib/session";

import { DisplayNameForm } from "./DisplayNameForm";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<{ title: string }> {
  const t = await getTranslations("profile");
  return { title: t("title") };
}

export default async function ProfilePage(): Promise<React.JSX.Element> {
  const locale = await getLocale();
  // `redirect` returns `never`, so the coalesce both sends the visitor to the
  // login page and leaves `session` non-null for the rest of the function.
  const session = (await getSession()) ?? redirect({ href: "/login", locale });

  const [t, common, play, profileNames, skillNames] = await Promise.all([
    getTranslations("profile"),
    getTranslations("common"),
    getTranslations("play"),
    getTranslations("game.profiles"),
    getTranslations("game.skills"),
  ]);

  const stored = await getMyProfile();
  // A player who has never synced has no row yet; the page still renders,
  // against the same empty progress the game itself starts from.
  const profile = stored.ok ? stored.data : null;
  const meta = profile?.meta ?? emptyMeta(new Date().toISOString());
  const displayName = profile?.displayName ?? session.user.name;

  // A read the page can do itself, so it does — a server action would only add
  // a round trip and a second place for the query to drift.
  const runs = await prisma.run.findMany({
    where: { profile: { userId: session.user.id } },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      mode: true,
      status: true,
      score: true,
      sprintsCompleted: true,
      createdAt: true,
      finishedAt: true,
    },
  });

  const floor = xpForLevel(meta.level);
  const ceiling = xpForLevel(meta.level + 1);
  const progress =
    ceiling > floor ? clamp(((meta.xp - floor) / (ceiling - floor)) * 100, 0, 100) : 100;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 px-3 py-8 sm:px-4 sm:py-12">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">{t("title")}</h1>
        <div className="mt-4 max-w-md">
          <DisplayNameForm initialName={displayName} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-line bg-panel/40">
          <CardHeader>
            <CardTitle className="text-sm">{t("level", { level: meta.level })}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Progress value={progress} />
            <p className="text-muted-foreground text-xs tabular-nums">
              {t("xpProgress", { current: meta.xp, next: ceiling })}
            </p>
          </CardContent>
        </Card>

        {/* Lifetime totals. No heading: the two labels say what they are, and
            the catalogue has no name for the pair that is not a lie. */}
        <Card className="border-line bg-panel/40">
          <CardContent className="flex gap-8 text-sm">
            <Stat label={common("commits")} value={meta.totalCommits} />
            <Stat label={t("columnBots")} value={meta.botsFired} />
          </CardContent>
        </Card>
      </div>

      <section>
        <h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
          {t("unlocks")}
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {meta.unlockedProfiles.map((id) => (
            <Badge key={id} variant="outline" className="border-branch-feature text-branch-feature">
              {profileNames(`${id}.name`)}
            </Badge>
          ))}
          {meta.unlockedSkills.map((id) => (
            <Badge key={id} variant="secondary">
              {skillNames(`${id}.name`)}
            </Badge>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
          {t("runHistory")}
        </h2>

        {runs.length === 0 ? (
          <p className="mt-3 text-muted-foreground text-sm">{t("empty")}</p>
        ) : (
          <div className="mt-3">
            <Table className="min-w-[30rem]">
              <TableHeader>
                <TableRow className="border-line">
                  <TableHead>{t("columnDate")}</TableHead>
                  <TableHead>{t("columnMode")}</TableHead>
                  <TableHead>{t("columnStatus")}</TableHead>
                  <TableHead className="text-right">{t("columnScore")}</TableHead>
                  <TableHead className="text-right">{t("columnSprints")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <TableRow key={run.id} className="border-line">
                    <TableCell className="text-muted-foreground tabular-nums">
                      {(run.finishedAt ?? run.createdAt).toISOString().slice(0, 10)}
                    </TableCell>
                    <TableCell>
                      {run.mode === "daily" ? play("modeDaily") : play("modeClassic")}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {t(`status.${run.status}`)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{run.score}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {run.sprintsCompleted}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }): React.JSX.Element {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-lg tabular-nums">{value}</p>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
