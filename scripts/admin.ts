import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { BALANCE } from "@/game/core/balance";
import { RunSaveSchema } from "@/game/dto/run";
import { RULES_FINGERPRINT } from "@/game/dto/version";
import type { ReportStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { digestSamples, renderDigestMarkdown, type SampleRow } from "@/lib/telemetry/digest";

import { Cooldown, describeWait } from "./lib/cooldown";

/**
 * The administration panel: a small server of its own, on this machine,
 * behind the password in `.env`. It reads the same database the site does
 * — local, or the production one when `DATABASE_URL` points there — and
 * offers what the site never should: the visit counts, every account with
 * a ban and a delete, every bug report with a status and a note, and the
 * balancing digest of every run the game sent home.
 *
 *   bun run admin            foreground, http://127.0.0.1:3100
 *   bun run db:up            also starts it in the background
 *   bun run admin:stop
 *
 * It binds to the loopback address only, keeps its sessions in memory,
 * refuses a password more than five times in a quarter of an hour, checks
 * the origin of every form and signs every form with the session, and
 * escapes everything it prints. It is not a public page and must never
 * become one: no `ADMIN_PASSWORD`, no panel.
 */

const HOST = "127.0.0.1";
const SESSION_HOURS = 12;
const COOKIE = "devgame_admin";
const DAYS = 30;

if (!env.ONLINE) {
  console.error("No DATABASE_URL: there is nothing to administer. `bun run init` first.");
  process.exit(1);
}
if (env.ADMIN_PASSWORD === undefined) {
  console.error("No ADMIN_PASSWORD in .env: the panel refuses to start without one.");
  process.exit(1);
}
const password = env.ADMIN_PASSWORD;
/** Closed for a minute after a wrong password, twice as long each time after. */
const door = new Cooldown();
const origin = `http://${HOST}:${env.ADMIN_PORT}`;

// --- sessions ---------------------------------------------------------------

const sessions = new Map<string, number>();

function passwordMatches(candidate: string): boolean {
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(password).digest();
  return timingSafeEqual(a, b);
}

function sessionOf(request: Request): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{48})`));
  const token = match?.[1];
  if (token === undefined) return null;
  const expires = sessions.get(token);
  if (expires === undefined || expires < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return token;
}

function openSession(): string {
  const token = randomBytes(24).toString("hex");
  sessions.set(token, Date.now() + SESSION_HOURS * 3_600_000);
  return token;
}

/** The form token: a hash of the session, so a form only works in its own session. */
function csrfOf(token: string): string {
  return createHash("sha256").update(`csrf:${token}`).digest("hex").slice(0, 32);
}

// --- html --------------------------------------------------------------------

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const CSS = `
:root{color-scheme:dark}body{margin:0;background:#14161b;color:#d7dae0;font:14px/1.5 "JetBrains Mono",ui-monospace,Menlo,monospace}
a{color:#5aa9e6}nav{display:flex;gap:1.25rem;padding:.75rem 1rem;border-bottom:1px solid #2f343f;background:#1b1e25}
nav a{color:#8b909c;text-decoration:none}nav a.on{color:#d7dae0}main{max-width:1100px;margin:0 auto;padding:1.5rem 1rem}
h1{font-size:1.25rem;margin:0 0 1rem}h2{font-size:.8rem;text-transform:uppercase;letter-spacing:.08em;color:#8b909c;margin:1.5rem 0 .5rem}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:.4rem .5rem;border-bottom:1px solid #2f343f;vertical-align:top}
th{color:#8b909c;font-weight:500}td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:.75rem}.card{border:1px solid #2f343f;background:#1b1e25;border-radius:6px;padding:.75rem}
.card b{display:block;font-size:1.4rem}.muted{color:#8b909c}.bad{color:#e2645a}.ok{color:#62c073}
input,select,textarea,button{font:inherit;background:#14161b;color:#d7dae0;border:1px solid #2f343f;border-radius:4px;padding:.3rem .5rem}
button{cursor:pointer;background:#21242c}button.danger{border-color:#e2645a;color:#e2645a}form.inline{display:inline-flex;gap:.35rem;align-items:center;margin:0 .25rem 0 0}
pre{white-space:pre-wrap;word-break:break-word;background:#1b1e25;border:1px solid #2f343f;border-radius:4px;padding:.5rem;margin:.25rem 0}
.login{max-width:360px;margin:6rem auto}.login input{width:100%;box-sizing:border-box;margin:.5rem 0}
`;

function page(
  title: string,
  body: string,
  options: { nav?: string; flash?: string; script?: string; status?: number } = {},
): Response {
  // The panel runs no script but the login page's countdown, and that one
  // only under a nonce minted for this response: the policy stays
  // `default-src 'none'` for everything else.
  const nonce = options.script === undefined ? null : randomBytes(16).toString("base64");
  const script =
    options.script === undefined ? "" : `<script nonce="${nonce}">${options.script}</script>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(title)} · Devgame admin</title><style>${CSS}</style></head><body>${options.nav ?? ""}<main>${options.flash === undefined ? "" : `<p class="ok">${esc(options.flash)}</p>`}${body}</main>${script}</body></html>`;
  return new Response(html, {
    status: options.status ?? 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      // Framed by the site's own /admin page in development, and by nothing
      // else: `frame-ancestors` is what `X-Frame-Options: DENY` could not say.
      "content-security-policy": `default-src 'none'; style-src 'unsafe-inline'; ${nonce === null ? "" : `script-src 'nonce-${nonce}'; `}form-action 'self'; frame-ancestors 'self' ${env.APP_URL}`,
      "referrer-policy": "no-referrer",
    },
  });
}

function nav(current: string, csrf: string): string {
  const link = (href: string, label: string): string =>
    `<a href="${href}" class="${current === href ? "on" : ""}">${label}</a>`;
  return `<nav>${link("/", "Stats")}${link("/accounts", "Accounts")}${link("/runs", "Runs")}${link("/reports", "Reports")}${link("/balance", "Balance")}<form method="post" action="/logout" class="inline" style="margin-left:auto"><input type="hidden" name="csrf" value="${csrf}"><button>Log out</button></form></nav>`;
}

function redirect(to: string, headers: Record<string, string> = {}): Response {
  return new Response(null, { status: 303, headers: { location: to, ...headers } });
}

function date(value: Date | null | undefined): string {
  return value == null ? "—" : value.toISOString().slice(0, 16).replace("T", " ");
}

// --- pages -------------------------------------------------------------------

/**
 * The balancing page: what real runs did, aggregated by the pure digest in
 * `src/lib/telemetry/digest.ts`, and the same digest as Markdown — in a
 * textarea to copy from, and as a file to download — with the current
 * balance constants appended, so a model can be handed the whole picture.
 */
async function balanceRows(rules: string): Promise<SampleRow[]> {
  const rows = await prisma.runSample.findMany({
    where: rules === "all" ? {} : { rules },
    orderBy: { createdAt: "desc" },
    take: 20_000,
    select: {
      clientRunId: true,
      kind: true,
      sprint: true,
      locale: true,
      sessionMs: true,
      idle: true,
      summary: true,
      createdAt: true,
    },
  });
  return rows.map((row) => ({
    ...row,
    idle: (row.idle ?? null) as SampleRow["idle"],
    summary: row.summary as unknown as SampleRow["summary"],
  }));
}

async function balanceMarkdown(rules: string): Promise<string> {
  const digest = digestSamples(await balanceRows(rules));
  return renderDigestMarkdown(digest, { rules, generatedAt: new Date(), balance: BALANCE });
}

async function balancePage(csrf: string, rules: string): Promise<Response> {
  const [rows, fingerprints] = await Promise.all([
    balanceRows(rules),
    prisma.runSample.groupBy({ by: ["rules"], _count: { _all: true }, orderBy: { rules: "asc" } }),
  ]);
  const d = digestSamples(rows);
  const markdown = renderDigestMarkdown(d, { rules, generatedAt: new Date(), balance: BALANCE });
  const q = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  const card = (label: string, value: string): string =>
    `<div class="card"><span class="muted">${label}</span><b>${value}</b></div>`;
  const spreadRows = (
    table: Record<string, { n: number; p10: number; p50: number; p90: number; max: number }>,
  ): string =>
    Object.entries(table)
      .filter(([, e]) => e.n > 0)
      .map(
        ([k, e]) =>
          `<tr><td>${esc(k)}</td><td class="num">${e.n}</td><td class="num">${q(e.p10)}</td><td class="num">${q(e.p50)}</td><td class="num">${q(e.p90)}</td><td class="num">${q(e.max)}</td></tr>`,
      )
      .join("");
  const spreadTable = (title: string, table: Parameters<typeof spreadRows>[0]): string =>
    `<h2>${title}</h2><table><tr><th>Measure</th><th class="num">n</th><th class="num">p10</th><th class="num">p50</th><th class="num">p90</th><th class="num">max</th></tr>${spreadRows(table) || '<tr><td colspan="6" class="muted">Nothing yet.</td></tr>'}</table>`;
  const countRows = (table: Record<string, number>, total: number): string =>
    Object.entries(table)
      .map(
        ([k, n]) =>
          `<tr><td>${esc(k)}</td><td class="num">${n}</td><td class="num muted">${total > 0 ? `${Math.round((n / total) * 100)}%` : ""}</td></tr>`,
      )
      .join("");
  const ended = Object.values(d.outcomes).reduce((a, b) => a + b, 0);
  const options = [
    `<option value="${esc(RULES_FINGERPRINT)}" ${rules === RULES_FINGERPRINT ? "selected" : ""}>current (${esc(RULES_FINGERPRINT)})</option>`,
    `<option value="all" ${rules === "all" ? "selected" : ""}>all fingerprints</option>`,
    ...fingerprints
      .filter((f) => f.rules !== RULES_FINGERPRINT)
      .map(
        (f) =>
          `<option value="${esc(f.rules)}" ${rules === f.rules ? "selected" : ""}>${esc(f.rules)} (${f._count._all})</option>`,
      ),
  ].join("");
  const body = `<h1>Balance</h1>
<form method="get" action="/balance" class="inline"><label>Rules <select name="rules">${options}</select></label><button>Show</button></form>
<a href="/balance.md?rules=${encodeURIComponent(rules)}" download="devgame-balance-${esc(rules)}.md" style="margin-left:1rem">Download the digest (.md)</a>
<div class="cards" style="margin-top:1rem">${card("Samples", String(d.samples))}${card("Runs", String(d.runs))}${card("Finished", String(ended))}${card("Abandoned", String(d.byKind.abandoned ?? 0))}${card("Median sprints", q(d.spread.sprints?.p50 ?? 0))}${card("Median tier", q(d.spread.tier?.p50 ?? 0))}${card("Idle on", d.idle.runs === 0 ? "—" : `${Math.round((d.idle.enabled / d.idle.runs) * 100)}%`)}</div>
<h2>For a model</h2><p class="muted">Select all, copy, paste. The same text as the download, balance constants included.</p><textarea readonly rows="14" style="width:100%;box-sizing:border-box;font-size:12px">${esc(markdown)}</textarea>
<h2>Outcomes</h2><table><tr><th>Outcome</th><th class="num">Runs</th><th class="num">Share</th></tr>${countRows(d.outcomes, ended) || '<tr><td colspan="3" class="muted">No finished run yet.</td></tr>'}</table>
<h2>What fills the gauge</h2><table><tr><th>Source</th><th class="num">Points</th><th></th></tr>${countRows(d.qualityBySource, 0)}</table>
${spreadTable("All runs, last known state", d.spread)}
${spreadTable("Finished runs", d.finals)}
${spreadTable("Abandoned runs, where they were left", d.abandoned)}
<h2>Tiers</h2><table><tr><th>Tier</th><th class="num">Runs reaching it</th><th class="num">Sprint p10</th><th class="num">p50</th><th class="num">p90</th></tr>${Object.entries(
    d.tiers,
  )
    .map(
      ([t, e]) =>
        `<tr><td>${esc(t)}</td><td class="num">${e.reached}</td><td class="num">${e.sprint.p10}</td><td class="num">${e.sprint.p50}</td><td class="num">${e.sprint.p90}</td></tr>`,
    )
    .join("")}</table>
<h2>Upgrades</h2><table><tr><th>Upgrade</th><th class="num">Runs buying</th><th class="num">p50 level</th><th class="num">max</th></tr>${Object.entries(
    d.upgrades,
  )
    .map(
      ([id, e]) =>
        `<tr><td>${esc(id)}</td><td class="num">${Math.round(e.rate * 100)}%</td><td class="num">${e.level.p50}</td><td class="num">${e.level.max}</td></tr>`,
    )
    .join("")}</table>
<h2>Skill tree</h2><table><tr><th>Node</th><th class="num">Runs buying</th><th class="num">p50 level</th><th class="num">max</th></tr>${Object.entries(
    d.tree,
  )
    .map(
      ([id, e]) =>
        `<tr><td>${esc(id)}</td><td class="num">${Math.round(e.rate * 100)}%</td><td class="num">${e.level.p50}</td><td class="num">${e.level.max}</td></tr>`,
    )
    .join("")}</table>
<h2>Narrative answers</h2><table><tr><th>Event</th><th>Choice</th><th class="num">Picked</th></tr>${Object.entries(
    d.answers,
  )
    .flatMap(([ev, choices]) =>
      Object.entries(choices).map(
        ([c, n]) => `<tr><td>${esc(ev)}</td><td>${esc(c)}</td><td class="num">${n}</td></tr>`,
      ),
    )
    .join("")}</table>
<h2>Objectives</h2><table><tr><th>Objective</th><th class="num">Done</th><th class="num">Failed</th></tr>${Object.entries(
    d.objectives,
  )
    .map(
      ([id, e]) =>
        `<tr><td>${esc(id)}</td><td class="num">${e.done}</td><td class="num">${e.failed}</td></tr>`,
    )
    .join("")}</table>
<h2>Tickets</h2><table><tr><th>Kind</th><th class="num">Arrived</th><th class="num">Delivered by the player</th></tr>${Object.entries(
    d.tickets,
  )
    .map(
      ([k, e]) =>
        `<tr><td>${esc(k)}</td><td class="num">${e.arrived}</td><td class="num">${e.byPlayer}</td></tr>`,
    )
    .join("")}</table>
<h2>Hands and hacks</h2><table><tr><th>Hand</th><th class="num">Tried</th><th class="num">Landed</th></tr>${Object.entries(
    d.commits,
  )
    .map(
      ([m, e]) =>
        `<tr><td>${esc(m)}</td><td class="num">${e.tried}</td><td class="num">${e.landed}</td></tr>`,
    )
    .join(
      "",
    )}<tr><td>hack</td><td class="num">${d.hacks.tried}</td><td class="num">${d.hacks.won}</td></tr></table>`;
  return page("Balance", body, { nav: nav("/balance", csrf) });
}

/**
 * The password prompt. While the door is closed the page says how long is
 * left and counts it down itself, a second at a time, then lets the form
 * be sent again — the wait is real either way, the server keeps its own
 * clock, and the page only spares a reload to find out it is over.
 */
function loginPage(options: { error?: string; waitMs?: number } = {}): Response {
  const wait = options.waitMs ?? 0;
  const closed = wait > 0;
  const error =
    options.error === undefined
      ? ""
      : `<p class="bad" id="cooldown">${esc(options.error)}${closed ? ` Try again in <span id="left">${esc(describeWait(wait))}</span>.` : ""}</p>`;
  const body = `<div class="login"><h1>Devgame admin</h1><form method="post" action="/login"><label>Password<input type="password" name="password" autocomplete="current-password" autofocus required></label>${error}<button${closed ? " disabled" : ""}>Enter</button></form></div>`;
  if (!closed) return page("Log in", body);

  // The same words as `describeWait`, kept in step by hand.
  const script = `(() => {
  const until = Date.now() + ${Math.round(wait)};
  const left = document.getElementById("left");
  const notice = document.getElementById("cooldown");
  const button = document.querySelector("button");
  const describe = (ms) => {
    const seconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    if (minutes === 0) return rest + " s";
    return rest === 0 ? minutes + " min" : minutes + " min " + rest + " s";
  };
  const tick = () => {
    const ms = until - Date.now();
    if (ms <= 0) {
      notice.textContent = "You can try again.";
      notice.className = "muted";
      button.disabled = false;
      return;
    }
    left.textContent = describe(ms);
    setTimeout(tick, 1000 - (ms % 1000 || 1000) + 20);
  };
  tick();
})();`;
  const response = page("Log in", body, { script, status: 429 });
  const headers = new Headers(response.headers);
  headers.set("retry-after", String(Math.ceil(wait / 1000)));
  return new Response(response.body, { status: 429, headers });
}

async function statsPage(csrf: string): Promise<Response> {
  const since = new Date(Date.now() - DAYS * 86_400_000);
  const [users, profiles, finished, inProgress, openReports, days, paths, banned] =
    await Promise.all([
      prisma.user.count(),
      prisma.profile.count(),
      prisma.run.count({ where: { status: "finished" } }),
      prisma.run.count({ where: { status: "in_progress" } }),
      prisma.bugReport.count({ where: { status: "open" } }),
      prisma.visitDay.groupBy({
        by: ["day"],
        where: { day: { gte: since } },
        _sum: { views: true, visits: true },
        orderBy: { day: "desc" },
      }),
      prisma.visitDay.groupBy({
        by: ["path"],
        where: { day: { gte: since } },
        _sum: { views: true, visits: true },
        orderBy: { _sum: { views: "desc" } },
      }),
      prisma.profile.count({ where: { bannedAt: { not: null } } }),
    ]);
  const totalViews = days.reduce((sum, row) => sum + (row._sum.views ?? 0), 0);
  const totalVisits = days.reduce((sum, row) => sum + (row._sum.visits ?? 0), 0);

  const card = (label: string, value: number, tone = ""): string =>
    `<div class="card"><span class="muted">${label}</span><b class="${tone}">${value}</b></div>`;
  const body = `<h1>Stats</h1>
<div class="cards">${card("Accounts", users)}${card("Profiles synced", profiles)}${card("Runs finished", finished)}${card("Runs in progress", inProgress)}${card("Open reports", openReports, openReports > 0 ? "bad" : "")}${card("Banned", banned, banned > 0 ? "bad" : "")}${card(`Visits, ${DAYS} days`, totalVisits)}${card(`Views, ${DAYS} days`, totalViews)}</div>
<h2>By day</h2><table><tr><th>Day</th><th class="num">Visits</th><th class="num">Views</th></tr>${days.map((row) => `<tr><td>${esc(row.day.toISOString().slice(0, 10))}</td><td class="num">${row._sum.visits ?? 0}</td><td class="num">${row._sum.views ?? 0}</td></tr>`).join("")}${days.length === 0 ? '<tr><td colspan="3" class="muted">Nothing counted yet.</td></tr>' : ""}</table>
<h2>By page, ${DAYS} days</h2><table><tr><th>Page</th><th class="num">Visits</th><th class="num">Views</th></tr>${paths.map((row) => `<tr><td>${esc(row.path)}</td><td class="num">${row._sum.visits ?? 0}</td><td class="num">${row._sum.views ?? 0}</td></tr>`).join("")}</table>`;
  return page("Stats", body, { nav: nav("/", csrf) });
}

async function accountsPage(csrf: string, query: string, flash?: string): Promise<Response> {
  const q = query.trim().slice(0, 80);
  const users = await prisma.user.findMany({
    where:
      q === ""
        ? {}
        : {
            OR: [
              { email: { contains: q, mode: "insensitive" } },
              { name: { contains: q, mode: "insensitive" } },
              { profile: { displayName: { contains: q, mode: "insensitive" } } },
            ],
          },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      profile: {
        select: {
          displayName: true,
          level: true,
          bannedAt: true,
          banReason: true,
          _count: { select: { runs: true } },
        },
      },
      _count: { select: { reports: true, sessions: true } },
    },
  });
  const rows = users
    .map((user) => {
      const banned = user.profile?.bannedAt != null;
      const hidden = `<input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="id" value="${esc(user.id)}">`;
      const ban = banned
        ? `<form method="post" action="/accounts/unban" class="inline">${hidden}<button>Unban</button></form>`
        : `<form method="post" action="/accounts/ban" class="inline">${hidden}<input name="reason" placeholder="reason" maxlength="200" size="14"><button>Ban</button></form>`;
      const del = `<form method="post" action="/accounts/delete" class="inline" onsubmit="return confirm('Delete ${esc(user.email)} and everything attached? This cannot be undone.')">${hidden}<button class="danger">Delete</button></form>`;
      return `<tr><td>${esc(user.email)}${user.emailVerified ? "" : ' <span class="muted">(unverified)</span>'}<br><span class="muted">${esc(user.name)} · ${esc(user.profile?.displayName ?? "—")}</span></td><td class="num">${user.profile?.level ?? "—"}</td><td class="num">${user.profile?._count.runs ?? 0}</td><td class="num">${user._count.reports}</td><td>${esc(date(user.createdAt))}</td><td>${banned ? `<span class="bad">banned ${esc(date(user.profile?.bannedAt))}</span><br><span class="muted">${esc(user.profile?.banReason ?? "")}</span>` : '<span class="ok">ok</span>'}</td><td>${ban}${del}</td></tr>`;
    })
    .join("");
  const body = `<h1>Accounts</h1><form method="get" action="/accounts" class="inline"><input name="q" value="${esc(q)}" placeholder="email, name, display name" size="32"><button>Search</button></form><span class="muted"> ${users.length} shown, newest first, 50 at most.</span>
<table><tr><th>Account</th><th class="num">Level</th><th class="num">Runs</th><th class="num">Reports</th><th>Created</th><th>Status</th><th>Actions</th></tr>${rows}${users.length === 0 ? '<tr><td colspan="7" class="muted">No account matches.</td></tr>' : ""}</table>
<p class="muted">A ban keeps the account and the game; it takes the leaderboard and the bug reports away, and nothing the player submits is scored. A delete removes the account, its profile, its runs, its sessions and its reports.</p>`;
  return page("Accounts", body, {
    nav: nav("/accounts", csrf),
    ...(flash === undefined ? {} : { flash }),
  });
}

const STATUSES: ReportStatus[] = ["open", "acknowledged", "closed"];

/**
 * The latest runs, each with a way into the site's debugger: the save is
 * replayed there one action at a time, forward with the animations and back
 * by replaying, which is how a run that went wrong is looked at.
 */
async function runsPage(csrf: string): Promise<Response> {
  const runs = await prisma.run.findMany({
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      id: true,
      seed: true,
      mode: true,
      status: true,
      score: true,
      updatedAt: true,
      save: true,
      profile: { select: { displayName: true, user: { select: { email: true } } } },
    },
  });
  const rows = runs
    .map((run) => {
      const save = RunSaveSchema.safeParse(run.save);
      const actions = save.success
        ? String(save.data.actions.length)
        : '<span class="bad">unreadable</span>';
      const who = run.profile.displayName ?? run.profile.user.email;
      const debug = `${env.APP_URL}/fr/debug/${encodeURIComponent(run.id)}`;
      return `<tr><td>${esc(date(run.updatedAt))}</td><td>${esc(who)}<br><span class="muted">${esc(run.profile.user.email)}</span></td><td><code>${esc(run.seed)}</code><br><span class="muted">${esc(run.mode)}</span></td><td>${esc(run.status)}</td><td class="num">${actions}</td><td class="num">${run.score ?? "—"}</td><td><a href="${esc(debug)}" target="_top">Debug</a></td></tr>`;
    })
    .join("");
  return page(
    "Runs",
    `<h1>Runs</h1><p class="muted">The last hundred saves. <b>Debug</b> opens the run in the site, one action at a time; the site has to run in development for the page to exist.</p><table><tr><th>Saved</th><th>Player</th><th>Seed</th><th>Status</th><th class="num">Actions</th><th class="num">Score</th><th></th></tr>${rows || '<tr><td colspan="7" class="muted">No run yet.</td></tr>'}</table>`,
    { nav: nav("/runs", csrf) },
  );
}

async function reportsPage(csrf: string, status: string, flash?: string): Promise<Response> {
  const filter = STATUSES.includes(status as ReportStatus) ? (status as ReportStatus) : "open";
  const reports = await prisma.bugReport.findMany({
    where: { status: filter },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { email: true, name: true } } },
  });
  const tabs = STATUSES.map(
    (value) =>
      `<a href="/reports?status=${value}" class="${value === filter ? "" : "muted"}">${value}</a>`,
  ).join(" · ");
  const rows = reports
    .map((report) => {
      const hidden = `<input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="id" value="${esc(report.id)}">`;
      const options = STATUSES.map(
        (value) =>
          `<option value="${value}" ${value === report.status ? "selected" : ""}>${value}</option>`,
      ).join("");
      return `<tr><td>${esc(date(report.createdAt))}<br><span class="muted">${esc(report.user.email)}</span></td><td><b>${esc(report.title)}</b><span class="muted"> · ${esc(report.page ?? "—")} · ${esc(report.seed ?? "—")}</span><pre>${esc(report.body)}</pre><form method="post" action="/reports/status" class="inline">${hidden}<select name="status">${options}</select><input name="note" value="${esc(report.note ?? "")}" placeholder="note (never shown)" maxlength="1000" size="40"><button>Save</button></form><form method="post" action="/reports/delete" class="inline" onsubmit="return confirm('Delete this report?')">${hidden}<button class="danger">Delete</button></form></td></tr>`;
    })
    .join("");
  const body = `<h1>Bug reports</h1><p>${tabs}</p><table><tr><th style="width:12rem">When · who</th><th>Report</th></tr>${rows}${reports.length === 0 ? '<tr><td colspan="2" class="muted">Nothing here.</td></tr>' : ""}</table>`;
  return page("Reports", body, {
    nav: nav("/reports", csrf),
    ...(flash === undefined ? {} : { flash }),
  });
}

// --- actions -----------------------------------------------------------------

async function form(request: Request): Promise<URLSearchParams> {
  const text = await request.text();
  if (text.length > 8_000) throw new Error("Form too large");
  return new URLSearchParams(text);
}

/**
 * Whether the form was posted from one of the panel's own pages.
 *
 * `Sec-Fetch-Site` is the answer when the browser sends it: the panel's
 * pages ask for `Referrer-Policy: no-referrer`, and a form posted under that
 * policy carries `Origin: null` and no `Referer` at all — from a tab or
 * from the site's frame alike — so the origin can only be the fallback.
 */
function sameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site !== null) return site === "same-origin";
  const from = request.headers.get("origin") ?? request.headers.get("referer") ?? "";
  return from.startsWith(origin) || from.startsWith(`http://localhost:${env.ADMIN_PORT}`);
}

async function act(request: Request, path: string, token: string): Promise<Response> {
  const data = await form(request);
  if (!sameOrigin(request)) {
    return new Response("Refused: the form did not come from this panel.", { status: 403 });
  }
  if (data.get("csrf") !== csrfOf(token)) {
    return new Response("Refused: the form did not come from this session.", { status: 403 });
  }
  const id = (data.get("id") ?? "").slice(0, 64);
  switch (path) {
    case "/logout":
      sessions.delete(token);
      return redirect("/login", {
        "set-cookie": `${COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict`,
      });
    case "/accounts/ban": {
      const reason = (data.get("reason") ?? "").trim().slice(0, 200);
      await prisma.profile.updateMany({
        where: { userId: id },
        data: { bannedAt: new Date(), banReason: reason === "" ? null : reason },
      });
      return redirect("/accounts?flash=banned");
    }
    case "/accounts/unban":
      await prisma.profile.updateMany({
        where: { userId: id },
        data: { bannedAt: null, banReason: null },
      });
      return redirect("/accounts?flash=unbanned");
    case "/accounts/delete":
      await prisma.user.delete({ where: { id } });
      return redirect("/accounts?flash=deleted");
    case "/reports/status": {
      const status = data.get("status") ?? "";
      if (!STATUSES.includes(status as ReportStatus))
        return new Response("Bad status", { status: 400 });
      const note = (data.get("note") ?? "").trim().slice(0, 1000);
      await prisma.bugReport.update({
        where: { id },
        data: { status: status as ReportStatus, note: note === "" ? null : note },
      });
      return redirect(`/reports?status=${status}&flash=saved`);
    }
    case "/reports/delete":
      await prisma.bugReport.delete({ where: { id } });
      return redirect("/reports?flash=deleted");
    default:
      return new Response("Not found", { status: 404 });
  }
}

// --- server ------------------------------------------------------------------

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const token = sessionOf(request);

  if (url.pathname === "/login") {
    if (request.method === "POST") {
      const now = Date.now();
      const wait = door.left(now);
      if (wait > 0) return loginPage({ error: "Wrong password earlier.", waitMs: wait });
      const data = await form(request);
      const candidate = data.get("password") ?? "";
      if (!passwordMatches(candidate)) {
        return loginPage({ error: "Wrong password.", waitMs: door.fail(now) });
      }
      door.succeed();
      const fresh = openSession();
      return redirect("/", {
        "set-cookie": `${COOKIE}=${fresh}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}`,
      });
    }
    if (token !== null) return redirect("/");
    const wait = door.left(Date.now());
    return wait > 0 ? loginPage({ error: "Wrong password earlier.", waitMs: wait }) : loginPage();
  }

  if (token === null) return redirect("/login");
  const csrf = csrfOf(token);
  const flash = url.searchParams.get("flash") ?? undefined;

  if (request.method === "POST") return act(request, url.pathname, token);
  switch (url.pathname) {
    case "/":
      return statsPage(csrf);
    case "/accounts":
      return accountsPage(csrf, url.searchParams.get("q") ?? "", flash);
    case "/runs":
      return runsPage(csrf);
    case "/reports":
      return reportsPage(csrf, url.searchParams.get("status") ?? "open", flash);
    case "/balance":
      return balancePage(csrf, url.searchParams.get("rules") ?? RULES_FINGERPRINT);
    case "/balance.md":
      return new Response(
        await balanceMarkdown(url.searchParams.get("rules") ?? RULES_FINGERPRINT),
        {
          headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "no-store" },
        },
      );
    default:
      return new Response("Not found", { status: 404 });
  }
}

const server = Bun.serve({
  hostname: HOST,
  port: env.ADMIN_PORT,
  async fetch(request) {
    try {
      return await handle(request);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : String(error);
      return page(
        "Error",
        `<h1>Something failed</h1><pre>${esc(message)}</pre><p class="muted">Is the database up? <code>bun run db:up</code> starts it.</p>`,
      );
    }
  },
});

console.log(`Devgame admin on http://${HOST}:${server.port} (password: ADMIN_PASSWORD in .env)`);
