import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import type { ReportStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { hit, LIMITS, rateKey } from "@/lib/rate-limit";

/**
 * The administration panel: a small server of its own, on this machine,
 * behind the password in `.env`. It reads the same database the site does
 * — local, or the production one when `DATABASE_URL` points there — and
 * offers what the site never should: the visit counts, every account with
 * a ban and a delete, every bug report with a status and a note.
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
  options: { nav?: string; flash?: string } = {},
): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(title)} · Devgame admin</title><style>${CSS}</style></head><body>${options.nav ?? ""}<main>${options.flash === undefined ? "" : `<p class="ok">${esc(options.flash)}</p>`}${body}</main></body></html>`;
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-frame-options": "DENY",
      "content-security-policy":
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",
      "referrer-policy": "no-referrer",
    },
  });
}

function nav(current: string, csrf: string): string {
  const link = (href: string, label: string): string =>
    `<a href="${href}" class="${current === href ? "on" : ""}">${label}</a>`;
  return `<nav>${link("/", "Stats")}${link("/accounts", "Accounts")}${link("/reports", "Reports")}<form method="post" action="/logout" class="inline" style="margin-left:auto"><input type="hidden" name="csrf" value="${csrf}"><button>Log out</button></form></nav>`;
}

function redirect(to: string, headers: Record<string, string> = {}): Response {
  return new Response(null, { status: 303, headers: { location: to, ...headers } });
}

function date(value: Date | null | undefined): string {
  return value == null ? "—" : value.toISOString().slice(0, 16).replace("T", " ");
}

// --- pages -------------------------------------------------------------------

function loginPage(error?: string): Response {
  return page(
    "Log in",
    `<div class="login"><h1>Devgame admin</h1><form method="post" action="/login"><label>Password<input type="password" name="password" autocomplete="current-password" autofocus required></label>${error === undefined ? "" : `<p class="bad">${esc(error)}</p>`}<button>Enter</button></form><p class="muted">The password is ADMIN_PASSWORD in .env. This panel listens on ${esc(origin)} only.</p></div>`,
  );
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

function sameOrigin(request: Request): boolean {
  const from = request.headers.get("origin") ?? request.headers.get("referer") ?? "";
  return from.startsWith(origin) || from.startsWith(`http://localhost:${env.ADMIN_PORT}`);
}

async function act(request: Request, path: string, token: string): Promise<Response> {
  const data = await form(request);
  if (data.get("csrf") !== csrfOf(token) || !sameOrigin(request)) {
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
      if (!hit(rateKey("adminLogin", {}, request), LIMITS.adminLogin).allowed) {
        return loginPage("Too many attempts. Come back in a quarter of an hour.");
      }
      const data = await form(request);
      const candidate = data.get("password") ?? "";
      if (!passwordMatches(candidate)) return loginPage("Wrong password.");
      const fresh = openSession();
      return redirect("/", {
        "set-cookie": `${COOKIE}=${fresh}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}`,
      });
    }
    return token === null ? loginPage() : redirect("/");
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
    case "/reports":
      return reportsPage(csrf, url.searchParams.get("status") ?? "open", flash);
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
