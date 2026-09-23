import type { RunSummary } from "@/game";
import { BALANCE } from "@/game/core/balance";

/**
 * The balancing digest: real runs, aggregated into the numbers the sim
 * cannot give — where people actually stop, what they buy, which answer
 * they pick, how far the idle clock carries them. Pure: rows in, an object
 * out, and a Markdown rendering of it shaped for pasting into a model's
 * context. The admin panel serves both.
 */
export interface SampleRow {
  clientRunId: string;
  kind: "final" | "checkpoint" | "abandoned";
  sprint: number;
  locale: string;
  sessionMs: number;
  idle: { enabled?: boolean; speed?: number } | null;
  summary: RunSummary;
  createdAt: Date;
}

export interface Quantiles {
  n: number;
  min: number;
  p10: number;
  p50: number;
  p90: number;
  max: number;
  mean: number;
}

export interface Digest {
  samples: number;
  runs: number;
  byKind: Record<string, number>;
  byRules: Record<string, number>;
  byLocale: Record<string, number>;
  /** Runs that ended, by how, and by what filled the gauge when it was that. */
  outcomes: Record<string, number>;
  causes: Record<string, number>;
  profiles: Record<string, number>;
  modes: Record<string, number>;
  /** Over the last sample of every run. */
  spread: Record<string, Quantiles>;
  /** Over the runs that ended. */
  finals: Record<string, Quantiles>;
  /** Over the runs left behind: how far they had got. */
  abandoned: Record<string, Quantiles>;
  /** Median sprint each tier was reached in, and how many runs reached it. */
  tiers: Record<string, { reached: number; sprint: Quantiles }>;
  /** Share of runs that bought at least one level, and the median level among those. */
  upgrades: Record<string, { rate: number; level: Quantiles }>;
  tree: Record<string, { rate: number; level: Quantiles }>;
  relics: Record<string, number>;
  skills: Record<string, number>;
  acquisitions: Record<string, number>;
  /** By event, then by choice: how often each was picked. */
  answers: Record<string, Record<string, number>>;
  objectives: Record<string, { done: number; failed: number }>;
  tickets: Record<string, { arrived: number; byPlayer: number }>;
  commits: Record<string, { tried: number; landed: number }>;
  hacks: { tried: number; won: number };
  qualityBySource: Record<string, number>;
  idle: { runs: number; enabled: number; speeds: Record<string, number> };
  sessionMinutes: Quantiles;
  ranks: Record<string, Quantiles>;
}

const EMPTY: Quantiles = { n: 0, min: 0, p10: 0, p50: 0, p90: 0, max: 0, mean: 0 };

export function quantiles(values: number[]): Quantiles {
  if (values.length === 0) return EMPTY;
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number): number =>
    sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  return {
    n: sorted.length,
    min: sorted[0] ?? 0,
    p10: at(0.1),
    p50: at(0.5),
    p90: at(0.9),
    max: sorted[sorted.length - 1] ?? 0,
    mean: sorted.reduce((sum, v) => sum + v, 0) / sorted.length,
  };
}

function count(table: Record<string, number>, key: string, by = 1): void {
  table[key] = (table[key] ?? 0) + by;
}

function slot<T>(table: Record<string, T>, key: string, empty: () => T): T {
  const held = table[key];
  if (held !== undefined) return held;
  const fresh = empty();
  table[key] = fresh;
  return fresh;
}

/**
 * One row per run: a final if it ended, otherwise where it was left, and
 * failing both the furthest checkpoint. Everything about a run in the
 * digest comes from that one row, so a run played to sprint 40 with four
 * checkpoints weighs as much as one that died at sprint 3.
 */
export function latestPerRun(rows: SampleRow[]): SampleRow[] {
  const rank = { final: 2, abandoned: 1, checkpoint: 0 } as const;
  const best = new Map<string, SampleRow>();
  for (const row of rows) {
    const held = best.get(row.clientRunId);
    if (
      held === undefined ||
      rank[row.kind] > rank[held.kind] ||
      (rank[row.kind] === rank[held.kind] && row.sprint > held.sprint)
    ) {
      best.set(row.clientRunId, row);
    }
  }
  return [...best.values()];
}

function measures(rows: SampleRow[]): Record<string, Quantiles> {
  const pick = (f: (s: RunSummary) => number): Quantiles =>
    quantiles(rows.map((r) => f(r.summary)));
  return {
    sprints: pick((s) => s.sprints),
    turns: pick((s) => s.turns),
    tier: pick((s) => s.tier),
    score: pick((s) => s.score),
    moneyPeakLog10: pick((s) => (s.money.peak > 0 ? Math.log10(s.money.peak) : 0)),
    moneyEarnedLog10: pick((s) => (s.money.earned > 0 ? Math.log10(s.money.earned) : 0)),
    mrr: pick((s) => s.money.mrr),
    ticketsDelivered: pick((s) => s.ticketsDelivered),
    deliveredByTeam: pick((s) => s.deliveredByTeam),
    reviews: pick((s) => s.reviews),
    rests: pick((s) => s.rests),
    hires: pick((s) => s.hires),
    incidents: pick((s) => s.incidents),
    outages: pick((s) => s.outages),
    rejections: pick((s) => s.rejections),
    staleForced: pick((s) => s.staleForced),
    deadlinesMissed: pick((s) => s.deadlinesMissed),
    quality: pick((s) => s.quality),
    debt: pick((s) => s.debt),
    share: pick((s) => s.share),
    unlockedSkills: pick((s) => s.unlockedSkills),
  };
}

function levelTable(
  runs: SampleRow[],
  read: (s: RunSummary) => Record<string, number>,
): Record<string, { rate: number; level: Quantiles }> {
  const levels: Record<string, number[]> = {};
  for (const row of runs) {
    for (const [id, level] of Object.entries(read(row.summary))) {
      if (level <= 0) continue;
      slot(levels, id, () => [] as number[]).push(level);
    }
  }
  const out: Record<string, { rate: number; level: Quantiles }> = {};
  for (const [id, values] of Object.entries(levels).sort((a, b) => b[1].length - a[1].length)) {
    out[id] = { rate: values.length / Math.max(1, runs.length), level: quantiles(values) };
  }
  return out;
}

function listTable(runs: SampleRow[], read: (s: RunSummary) => string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of runs) for (const id of read(row.summary)) count(out, id);
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]));
}

export function digestSamples(rows: SampleRow[]): Digest {
  const runs = latestPerRun(rows);
  const finals = runs.filter((r) => r.kind === "final");
  const abandoned = runs.filter((r) => r.kind === "abandoned");

  const digest: Digest = {
    samples: rows.length,
    runs: runs.length,
    byKind: {},
    byRules: {},
    byLocale: {},
    outcomes: {},
    causes: {},
    profiles: {},
    modes: {},
    spread: measures(runs),
    finals: measures(finals),
    abandoned: measures(abandoned),
    tiers: {},
    upgrades: levelTable(runs, (s) => s.upgrades),
    tree: levelTable(runs, (s) => s.tree),
    relics: listTable(runs, (s) => s.relics),
    skills: listTable(runs, (s) => s.skills),
    acquisitions: listTable(runs, (s) => s.acquisitions),
    answers: {},
    objectives: {},
    tickets: {},
    commits: { craft: { tried: 0, landed: 0 }, ai: { tried: 0, landed: 0 } },
    hacks: { tried: 0, won: 0 },
    qualityBySource: {},
    idle: { runs: 0, enabled: 0, speeds: {} },
    sessionMinutes: quantiles(runs.map((r) => r.sessionMs / 60_000)),
    ranks: {},
  };

  for (const row of rows) count(digest.byKind, row.kind);
  const tierSprints: Record<string, number[]> = {};
  const rankCounts: Record<string, number[]> = {};

  for (const row of runs) {
    const s = row.summary;
    count(digest.byRules, s.rules);
    count(digest.byLocale, row.locale);
    count(digest.profiles, s.profileId);
    count(digest.modes, s.mode);
    if (row.kind === "final") {
      count(digest.outcomes, s.outcome);
      if (s.cause !== null) count(digest.causes, s.cause);
    }
    for (const [tier, sprint] of Object.entries(s.tierSprint))
      slot(tierSprints, tier, () => [] as number[]).push(sprint);
    for (const [key, n] of Object.entries(s.answers)) {
      const [eventId = "?", choice = "?"] = key.split(":");
      count(
        slot(digest.answers, eventId, () => ({})),
        choice,
        n,
      );
    }
    for (const [id, { done, failed }] of Object.entries(s.objectives)) {
      const entry = slot(digest.objectives, id, () => ({ done: 0, failed: 0 }));
      entry.done += done;
      entry.failed += failed;
    }
    for (const [kind, n] of Object.entries(s.arrivedByKind)) {
      slot(digest.tickets, kind, () => ({ arrived: 0, byPlayer: 0 })).arrived += n;
    }
    for (const [kind, n] of Object.entries(s.deliveredByPlayer)) {
      slot(digest.tickets, kind, () => ({ arrived: 0, byPlayer: 0 })).byPlayer += n;
    }
    for (const mode of ["craft", "ai"] as const) {
      const entry = digest.commits[mode] ?? { tried: 0, landed: 0 };
      entry.tried += s.commitsTried[mode];
      entry.landed += s.commitsLanded[mode];
      digest.commits[mode] = entry;
    }
    digest.hacks.tried += s.hacks.tried;
    digest.hacks.won += s.hacks.won;
    for (const [source, n] of Object.entries(s.qualityBySource))
      count(digest.qualityBySource, source, n);
    for (const [rank, n] of Object.entries(s.devsByRank))
      slot(rankCounts, rank, () => [] as number[]).push(n);
    if (row.idle !== null && typeof row.idle.enabled === "boolean") {
      digest.idle.runs += 1;
      if (row.idle.enabled) {
        digest.idle.enabled += 1;
        count(digest.idle.speeds, `x${row.idle.speed ?? 1}`);
      }
    }
  }

  for (const [tier, sprints] of Object.entries(tierSprints).sort(
    (a, b) => Number(a[0]) - Number(b[0]),
  )) {
    digest.tiers[tier] = { reached: sprints.length, sprint: quantiles(sprints) };
  }
  for (const [rank, values] of Object.entries(rankCounts)) digest.ranks[rank] = quantiles(values);
  return digest;
}

// --- Markdown ---------------------------------------------------------------

const fmt = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(2));
const pct = (v: number): string => `${Math.round(v * 100)}%`;

function quantileTable(title: string, table: Record<string, Quantiles>): string {
  const rows = Object.entries(table).filter(([, q]) => q.n > 0);
  if (rows.length === 0) return "";
  return `### ${title}\n\n| measure | n | min | p10 | p50 | p90 | max | mean |\n|---|---|---|---|---|---|---|---|\n${rows
    .map(
      ([k, q]) =>
        `| ${k} | ${q.n} | ${fmt(q.min)} | ${fmt(q.p10)} | ${fmt(q.p50)} | ${fmt(q.p90)} | ${fmt(q.max)} | ${fmt(q.mean)} |`,
    )
    .join("\n")}\n\n`;
}

function countTable(title: string, table: Record<string, number>, total?: number): string {
  const rows = Object.entries(table);
  if (rows.length === 0) return "";
  const share = (n: number): string =>
    total === undefined || total === 0 ? "" : ` | ${pct(n / total)}`;
  return `### ${title}\n\n| key | count${total === undefined ? "" : " | share"} |\n|---|---|${total === undefined ? "" : "---|"}\n${rows
    .map(([k, n]) => `| ${k} | ${n}${share(n)} |`)
    .join("\n")}\n\n`;
}

/**
 * The digest as a document a model can reason over: what the rules are
 * right now, what real runs did under them, and how to read the two
 * together. Tables, not prose; every number labelled; the balance file
 * quoted whole at the end so a suggestion can name the constant to change.
 */
export function renderDigestMarkdown(
  digest: Digest,
  options: { rules: string; generatedAt: Date; balance?: unknown } = {
    rules: "all",
    generatedAt: new Date(0),
  },
): string {
  const d = digest;
  const parts: string[] = [];
  parts.push(`# Devgame — balancing digest\n\n`);
  parts.push(
    `Generated ${options.generatedAt.toISOString()} · rules fingerprint: ${options.rules} · ${d.samples} samples over ${d.runs} distinct runs.\n\n`,
  );
  parts.push(
    `## How to read this\n\n- A run is one seed and one player's decisions. Each run counts once, at its last known state: \`final\` if it ended, else \`abandoned\` (the player started another run over it), else its furthest \`checkpoint\` (sent every ${10} sprints while it goes on).\n- Money is in the engine's integer units; \`Log10\` columns are orders of magnitude (3 = 1 000, 6 = 1 000 000).\n- \`tier\` is the company's stage, reached by lifetime earnings, 0 to ${BALANCE.economy.tier.last}.\n- Outcomes: \`burnout\` (energy gone), \`fired\` (the production gauge full — \`causes\` says what filled it), \`caught\` (a hack went wrong), \`capped\` (the turn ceiling).\n- The sim (\`bun run sim\`) plays fixed policies; these are people. Where they disagree, trust these.\n- The numbers to change live in \`src/game/core/balance.ts\`, quoted at the end. Suggest a constant and a direction, not a rewrite.\n\n`,
  );
  parts.push(`## Population\n\n`);
  parts.push(countTable("Samples by kind", d.byKind, d.samples));
  parts.push(countTable("Runs by rules fingerprint", d.byRules, d.runs));
  parts.push(countTable("Runs by locale", d.byLocale, d.runs));
  parts.push(countTable("Runs by starter profile", d.profiles, d.runs));
  parts.push(countTable("Runs by mode", d.modes, d.runs));
  parts.push(`## Endings\n\n`);
  const ended = Object.values(d.outcomes).reduce((a, b) => a + b, 0);
  parts.push(countTable("Outcomes (finished runs)", d.outcomes, ended));
  parts.push(countTable("What filled the gauge when fired", d.causes));
  parts.push(countTable("Gauge points by source, all runs", d.qualityBySource));
  parts.push(`## Progress\n\n`);
  parts.push(quantileTable("All runs, last known state", d.spread));
  parts.push(quantileTable("Finished runs", d.finals));
  parts.push(quantileTable("Abandoned runs, where they were left", d.abandoned));
  if (Object.keys(d.tiers).length > 0) {
    parts.push(
      `### Tiers: sprint reached\n\n| tier | runs reaching it | share | p10 | p50 | p90 |\n|---|---|---|---|---|---|\n${Object.entries(
        d.tiers,
      )
        .map(
          ([t, e]) =>
            `| ${t} | ${e.reached} | ${pct(e.reached / Math.max(1, d.runs))} | ${e.sprint.p10} | ${e.sprint.p50} | ${e.sprint.p90} |`,
        )
        .join("\n")}\n\n`,
    );
  }
  parts.push(`## Decisions\n\n`);
  const levels = (
    title: string,
    table: Record<string, { rate: number; level: Quantiles }>,
  ): string => {
    const rows = Object.entries(table);
    if (rows.length === 0) return "";
    return `### ${title}\n\n| id | runs buying | p50 level | p90 level | max level |\n|---|---|---|---|---|\n${rows
      .map(
        ([id, e]) =>
          `| ${id} | ${pct(e.rate)} | ${e.level.p50} | ${e.level.p90} | ${e.level.max} |`,
      )
      .join("\n")}\n\n`;
  };
  parts.push(levels("Upgrades bought", d.upgrades));
  parts.push(levels("Skill tree nodes", d.tree));
  parts.push(countTable("Relics held at the end", d.relics, d.runs));
  parts.push(countTable("Skills held at the end", d.skills, d.runs));
  parts.push(countTable("Acquisitions", d.acquisitions, d.runs));
  parts.push(
    `### Commits\n\n| hand | tried | landed | landing rate |\n|---|---|---|---|\n${Object.entries(
      d.commits,
    )
      .map(
        ([m, e]) =>
          `| ${m} | ${e.tried} | ${e.landed} | ${e.tried === 0 ? "—" : pct(e.landed / e.tried)} |`,
      )
      .join("\n")}\n\n`,
  );
  parts.push(
    `### Hacks\n\n| tried | won | win rate |\n|---|---|---|\n| ${d.hacks.tried} | ${d.hacks.won} | ${d.hacks.tried === 0 ? "—" : pct(d.hacks.won / d.hacks.tried)} |\n\n`,
  );
  const answers = Object.entries(d.answers);
  if (answers.length > 0) {
    parts.push(
      `### Narrative answers\n\n| event | choice | picked | share |\n|---|---|---|---|\n${answers
        .flatMap(([event, choices]) => {
          const total = Object.values(choices).reduce((a, b) => a + b, 0);
          return Object.entries(choices).map(
            ([c, n]) => `| ${event} | ${c} | ${n} | ${pct(n / total)} |`,
          );
        })
        .join("\n")}\n\n`,
    );
  }
  const objectives = Object.entries(d.objectives);
  if (objectives.length > 0) {
    parts.push(
      `### Sprint objectives\n\n| objective | done | failed | success |\n|---|---|---|---|\n${objectives
        .map(
          ([id, e]) =>
            `| ${id} | ${e.done} | ${e.failed} | ${pct(e.done / Math.max(1, e.done + e.failed))} |`,
        )
        .join("\n")}\n\n`,
    );
  }
  const tickets = Object.entries(d.tickets);
  if (tickets.length > 0) {
    parts.push(
      `### Tickets by kind\n\n| kind | arrived | delivered by the player | share delivered |\n|---|---|---|---|\n${tickets
        .map(
          ([k, e]) =>
            `| ${k} | ${e.arrived} | ${e.byPlayer} | ${e.arrived === 0 ? "—" : pct(e.byPlayer / e.arrived)} |`,
        )
        .join("\n")}\n\n`,
    );
  }
  parts.push(quantileTable("Team size by rank, last known state", d.ranks));
  parts.push(`## Pace\n\n`);
  parts.push(
    `- Idle clock: ${d.idle.runs === 0 ? "no data" : `${pct(d.idle.enabled / d.idle.runs)} of runs had it on at their last sample`}${
      Object.keys(d.idle.speeds).length > 0
        ? ` (speeds: ${Object.entries(d.idle.speeds)
            .map(([s, n]) => `${s} ×${n}`)
            .join(", ")})`
        : ""
    }.\n`,
  );
  parts.push(quantileTable("Minutes on the run in the tab", { sessionMinutes: d.sessionMinutes }));
  if (options.balance !== undefined) {
    parts.push(
      `## Current balance constants\n\n\`\`\`json\n${JSON.stringify(options.balance, null, 2)}\n\`\`\`\n`,
    );
  }
  return parts.join("");
}
