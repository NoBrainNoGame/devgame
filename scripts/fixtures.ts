import { fnv1a } from "@/game/core/hash";
import { emptyMeta, type MetaProgressDto } from "@/game/dto/meta";
import { replayRun, runFingerprint } from "@/game/dto/replay";
import type { RunSaveDto } from "@/game/dto/run";
import { RULES_EPOCH, SAVE_VERSION } from "@/game/dto/version";
import type { Prisma } from "@/generated/prisma/client";
import { getDailySeed } from "@/lib/daily/store";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { applyRunToMeta } from "@/lib/profile/progression";
import { toColumns } from "@/lib/profile/row";
import { ingestSample } from "@/lib/telemetry/ingest";
import type { RunSampleInput } from "@/lib/telemetry/schema";

import {
  FIXTURE_ACCOUNTS,
  FIXTURE_EMAIL_DOMAIN,
  FIXTURE_REPORTS,
  FIXTURE_RUN_PREFIX,
  type FixtureAccount,
  fixtureUuid,
  isLocalDatabase,
  playFixtureRun,
  starterFor,
  VISIT_DAYS,
  visitRows,
} from "./lib/fixtures";

/**
 * Fills the local database with something to look at.
 *
 *   bun run fixtures            thirteen accounts, their runs, a month of stats
 *   bun run fixtures --clean    remove them and stop
 *
 * `bun run init` runs it at the end. Loading twice is the same as loading
 * once: everything it wrote is found again by its address or its id and
 * replaced.
 *
 * What goes in, and by which road:
 *
 * - Accounts, as Better Auth's `user` rows, each with a `Profile` whose
 *   level and unlocks were *earned* — the loader applies each finished run's
 *   reward through `applyRunToMeta`, the same function `submitRun` calls.
 * - Runs, played by the headless policies of `scripts/lib/policy.ts` and
 *   scored by `replayRun`, exactly as a submission is. Classic and daily,
 *   finished and in progress, one abandoned, one the server refused, and one
 *   suspended player whose scores the board must not show.
 * - Run samples for the Balance page, through `ingestSample`, and a month of
 *   page views for the Stats page. A few bug reports in every status.
 *
 * It refuses any database that is not on this machine.
 */

interface Totals {
  accounts: number;
  runs: number;
  samples: number;
  reports: number;
  visits: number;
}

function daysBefore(now: Date, days: number, jitterKey: string): Date {
  // A few hours of jitter, stable per key, so rows do not line up at midnight.
  const jitter = ((fnv1a(jitterKey) >>> 0) % (6 * 60)) * 60_000;
  return new Date(now.getTime() - days * 86_400_000 - jitter);
}

function startOfUtcDay(at: Date): number {
  return Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
}

/** A moment earlier today, in UTC, that is still today. */
function earlierToday(now: Date, hoursAgo: number): Date {
  const at = now.getTime() - hoursAgo * 3_600_000;
  return new Date(Math.max(at, startOfUtcDay(now) + 5 * 60_000));
}

function yesterdayAt(now: Date, hour: number, jitterKey: string): Date {
  const jitter = ((fnv1a(jitterKey) >>> 0) % 50) * 60_000;
  return new Date(startOfUtcDay(now) - 86_400_000 + hour * 3_600_000 + jitter);
}

/** Roughly forty seconds a turn, never in the future. */
function finishedAfter(createdAt: Date, turns: number, now: Date): Date {
  return new Date(Math.min(createdAt.getTime() + turns * 40_000, now.getTime() - 60_000));
}

type Daily = { date: string; seed: string };

interface Plan {
  label: string;
  mode: "classic" | "daily";
  seed: string;
  daily?: Daily;
  at: Date;
  kind: "finished" | "in_progress" | "abandoned" | "rejected";
  /** The sprint the player held on until, then walked away. Zero: played to the end. */
  held?: number;
}

/** Everything one account played, oldest first. */
function planFor(
  account: FixtureAccount,
  now: Date,
  daily: Record<"today" | "yesterday", Daily>,
): Plan[] {
  const plans: Plan[] = account.classic.map(([days, held], index) => ({
    label: `classic-${index + 1}`,
    mode: "classic",
    seed: `fixture-${account.slug}-${index + 1}`,
    at: daysBefore(now, days, `${account.slug}:${index}`),
    kind: "finished",
    held,
  }));

  for (const [which, held] of account.daily) {
    plans.push({
      label: `daily-${which}`,
      mode: "daily",
      seed: daily[which].seed,
      daily: daily[which],
      at: which === "today" ? earlierToday(now, 3) : yesterdayAt(now, 13, account.slug),
      kind: "finished",
      held,
    });
  }

  if (account.abandoned) {
    plans.push({
      label: "abandoned",
      mode: "classic",
      seed: `fixture-${account.slug}-abandoned`,
      at: daysBefore(now, 2, `${account.slug}:abandoned`),
      kind: "abandoned",
    });
  }

  if (account.rejected) {
    plans.push({
      label: "rejected",
      mode: "classic",
      seed: `fixture-${account.slug}-tampered`,
      at: daysBefore(now, 3, `${account.slug}:rejected`),
      kind: "rejected",
      held: 6,
    });
  }

  if (account.inProgress !== undefined) {
    const isDaily = account.inProgress === "daily";
    plans.push({
      label: "in-progress",
      mode: account.inProgress,
      seed: isDaily ? daily.today.seed : `fixture-${account.slug}-current`,
      ...(isDaily ? { daily: daily.today } : {}),
      at: earlierToday(now, 0.5),
      kind: "in_progress",
    });
  }

  return plans.sort((a, b) => a.at.getTime() - b.at.getTime());
}

function sampleInput(
  save: RunSaveDto,
  kind: RunSampleInput["kind"],
  account: FixtureAccount,
  turns: number,
): RunSampleInput {
  const idleOn = account.policy === "ai" || account.policy === "mixed";
  return {
    save,
    kind,
    locale: account.locale,
    sessionMs: turns * (25_000 + ((fnv1a(save.seed) >>> 0) % 20_000)),
    idle: { enabled: idleOn, speed: account.policy === "ai" ? 100 : 10 },
  };
}

async function loadAccount(
  account: FixtureAccount,
  now: Date,
  daily: Record<"today" | "yesterday", Daily>,
  totals: Totals,
): Promise<void> {
  const since = daysBefore(now, account.since, account.slug);
  let meta: MetaProgressDto = emptyMeta(since.toISOString());
  let metaVersion = 1;
  let finished = 0;
  let best = 0;

  const rows: Prisma.RunCreateWithoutProfileInput[] = [];
  const samples: { input: RunSampleInput; at: Date }[] = [];

  for (const [index, plan] of planFor(account, now, daily).entries()) {
    const unfinished = plan.kind === "in_progress" || plan.kind === "abandoned";
    const where = `${account.slug} ${plan.label} (${plan.seed})`;
    const played = playFixtureRun({
      seed: plan.seed,
      mode: plan.mode,
      profileId: starterFor(meta, index),
      // A run meant to still be going has to get to sprint 4: the careful
      // hand never takes a hack and never gets fired that early.
      policy: unfinished ? "careful" : account.policy,
      meta,
      clientRunId: fixtureUuid(`${account.slug}:${plan.label}`),
      createdAt: plan.at.toISOString(),
      ...(unfinished ? { stopAtSprint: 4 } : {}),
      ...(plan.held === undefined || plan.held === 0 ? {} : { quitAtSprint: plan.held }),
    });

    const base = {
      mode: plan.mode,
      seed: plan.seed,
      ...(plan.daily === undefined
        ? {}
        : { dailyDate: new Date(`${plan.daily.date}T00:00:00.000Z`) }),
      version: SAVE_VERSION,
      clientRunId: played.save.clientRunId,
      createdAt: plan.at,
    };

    if (plan.kind === "rejected") {
      // A log that goes on after the run ended: the one forgery the replay
      // names in so many words.
      const tampered: RunSaveDto = {
        ...played.save,
        actions: [...played.save.actions, { type: "rest" }],
      };
      const replay = replayRun(tampered);
      if (replay.valid) throw new Error(`${where}: the tampered log replayed`);
      rows.push({
        ...base,
        status: "rejected",
        save: tampered as Prisma.InputJsonValue,
        fingerprint: runFingerprint(tampered),
      });
      continue;
    }

    const replay = replayRun(played.save);
    if (!replay.valid) throw new Error(`${where}: does not replay: ${replay.error}`);

    if (plan.kind !== "finished") {
      if (replay.finished) throw new Error(`${where}: ended before sprint 4`);
      rows.push({
        ...base,
        status: plan.kind,
        save: played.save as Prisma.InputJsonValue,
        fingerprint: runFingerprint(played.save),
        commits: played.save.actions.length,
      });
      if (plan.kind === "abandoned") {
        samples.push({
          input: sampleInput(played.save, "abandoned", account, replay.stats.turns),
          at: plan.at,
        });
      }
      continue;
    }

    if (!replay.finished) throw new Error(`${where}: the ${account.policy} policy never ended it`);
    const finishedAt = finishedAfter(plan.at, replay.stats.turns, now);
    rows.push({
      ...base,
      status: "finished",
      rulesEpoch: RULES_EPOCH,
      save: played.save as Prisma.InputJsonValue,
      fingerprint: runFingerprint(played.save),
      score: replay.score,
      sprintsCompleted: replay.stats.sprints,
      ticketsDelivered: replay.stats.ticketsDelivered,
      commits: replay.stats.commits,
      finishedAt,
    });
    samples.push({
      input: sampleInput(played.save, "final", account, replay.stats.turns),
      at: finishedAt,
    });
    for (const length of played.checkpoints) {
      const partial = { ...played.save, actions: played.save.actions.slice(0, length) };
      samples.push({ input: sampleInput(partial, "checkpoint", account, length), at: finishedAt });
    }

    meta = applyRunToMeta(
      meta,
      {
        xp: replay.stats.xp,
        commits: replay.stats.commits,
        ticketsDelivered: replay.stats.ticketsDelivered,
        sprints: replay.stats.sprints,
      },
      finishedAt.toISOString(),
    ).meta;
    metaVersion += 1;
    finished += 1;
    best = Math.max(best, replay.score);
  }

  await prisma.user.create({
    data: {
      id: `fx_${account.slug}`,
      name: account.displayName,
      email: `${account.slug}@${FIXTURE_EMAIL_DOMAIN}`,
      emailVerified: true,
      createdAt: since,
      profile: {
        create: {
          displayName: account.displayName,
          ...toColumns(meta),
          metaVersion,
          createdAt: since,
          ...(account.banned === undefined
            ? {}
            : { bannedAt: daysBefore(now, 1, `${account.slug}:ban`), banReason: account.banned }),
          runs: { create: rows },
        },
      },
    },
  });

  for (const sample of samples) {
    const summary = await ingestSample(sample.input);
    if (summary === null) throw new Error(`${sample.input.save.seed}: the sample was refused`);
    await prisma.runSample.updateMany({
      where: {
        clientRunId: sample.input.save.clientRunId,
        kind: sample.input.kind,
        sprint: summary.sprints,
      },
      data: { createdAt: sample.at },
    });
  }

  totals.accounts += 1;
  totals.runs += rows.length;
  totals.samples += samples.length;
  console.log(
    `  ${account.displayName.padEnd(16)} ${String(finished).padStart(2)} finished  level ${String(meta.level).padStart(2)}  best ${String(best).padStart(6)}${account.banned === undefined ? "" : "  (banned)"}`,
  );
}

async function loadReports(now: Date, totals: Totals): Promise<void> {
  for (const report of FIXTURE_REPORTS) {
    await prisma.bugReport.create({
      data: {
        userId: `fx_${report.slug}`,
        title: report.title,
        body: report.body,
        page: report.page ?? null,
        seed: report.seed ?? null,
        status: report.status,
        note: report.note ?? null,
        createdAt: daysBefore(now, report.daysAgo, `report:${report.title}`),
      },
    });
    totals.reports += 1;
  }
}

async function loadVisits(now: Date, totals: Totals): Promise<void> {
  const rows = visitRows(now);
  await prisma.$transaction(
    rows.map((row) =>
      prisma.visitDay.upsert({
        where: { day_path_locale: { day: row.day, path: row.path, locale: row.locale } },
        create: row,
        update: { views: row.views, visits: row.visits },
      }),
    ),
  );
  totals.visits = rows.length;
}

/** Removes what a previous load wrote: accounts by address, samples by id, views by day. */
async function clean(now: Date): Promise<{ users: number; samples: number; visits: number }> {
  const users = await prisma.user.deleteMany({
    where: { email: { endsWith: `@${FIXTURE_EMAIL_DOMAIN}` } },
  });
  const samples = await prisma.runSample.deleteMany({
    where: { clientRunId: { startsWith: FIXTURE_RUN_PREFIX } },
  });
  const oldest = new Date(startOfUtcDay(now) - (VISIT_DAYS - 1) * 86_400_000);
  const visits = await prisma.visitDay.deleteMany({ where: { day: { gte: oldest } } });
  return { users: users.count, samples: samples.count, visits: visits.count };
}

async function main(): Promise<void> {
  if (!env.ONLINE) {
    throw new Error("No DATABASE_URL: there is no database to fill. `bun run init` first.");
  }
  if (env.NODE_ENV === "production" || !isLocalDatabase(env.DATABASE_URL ?? "")) {
    throw new Error(
      "Fixtures only go into a database on this machine. DATABASE_URL points elsewhere; " +
        "point it at the local Postgres (`bun run init` writes that) and run again.",
    );
  }

  const now = new Date();
  const removed = await clean(now);
  if (removed.users > 0 || removed.samples > 0) {
    console.log(
      `Removed the previous fixtures (${removed.users} accounts, ${removed.samples} samples).`,
    );
  }
  if (process.argv.includes("--clean")) {
    console.log("Clean. Nothing loaded.");
    return;
  }

  const daily = {
    today: await getDailySeed(now),
    yesterday: await getDailySeed(new Date(now.getTime() - 86_400_000)),
  };

  const totals: Totals = { accounts: 0, runs: 0, samples: 0, reports: 0, visits: 0 };
  console.log("Playing the fixture runs…");
  for (const account of FIXTURE_ACCOUNTS) {
    await loadAccount(account, now, daily, totals);
  }
  await loadReports(now, totals);
  await loadVisits(now, totals);

  console.log(
    `\nLoaded ${totals.accounts} accounts, ${totals.runs} runs, ${totals.samples} run samples, ${totals.reports} bug reports, ${VISIT_DAYS} days of page views.`,
  );
  // The boards filter on the epoch; a server built from other rules shows
  // an empty board over a full table, which is worth saying out loud.
  console.log(
    `The finished runs carry rulesEpoch ${RULES_EPOCH}: a server running another epoch will not list them.`,
  );
  console.log(
    `Sign in as any of them: enter <name>@${FIXTURE_EMAIL_DOMAIN} on /login and copy the magic link from the dev server's terminal.`,
  );
  console.log("`bun run fixtures --clean` removes them.");
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
