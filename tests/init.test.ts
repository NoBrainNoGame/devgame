import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { parseEnvironment } from "@/lib/env";

import { init, parseInitArgs, renderEnv } from "../scripts/init";

/**
 * `bun run init` copies `.env.example` to a `.env` the app accepts: online
 * with random secrets of the right length, or offline with no database at all.
 * The committed example is what it copies, so the tests read that very file.
 */

const EXAMPLE = resolve(import.meta.dir, "..", ".env.example");
const example = readFileSync(EXAMPLE, "utf8");
const online = { offline: false, postgresPort: "5443" };

/** Reads a dotenv text the way the runtime would, quotes stripped. */
function parseDotenv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    const raw = trimmed.slice(eq + 1);
    out[key] = raw.replace(/^"(.*)"$/, "$1");
  }
  return out;
}

describe("bun run init", () => {
  test(".env.example names every variable env.ts reads, and no secret is filled in", () => {
    const keys = Object.keys(parseDotenv(example));
    for (const name of [
      "DATABASE_URL",
      "APP_URL",
      "BETTER_AUTH_SECRET",
      "BETTER_AUTH_URL",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "CRON_SECRET",
      "DAILY_SEED_SECRET",
      "ADMIN_PASSWORD",
      "ADMIN_PORT",
    ]) {
      expect(keys).toContain(name);
    }
    const values = parseDotenv(example);
    for (const name of [
      "BETTER_AUTH_SECRET",
      "CRON_SECRET",
      "DAILY_SEED_SECRET",
      "ADMIN_PASSWORD",
    ]) {
      expect(values[name]).toBe("");
    }
  });

  test("copies an online .env the schema accepts, with fresh secrets", () => {
    const rendered = renderEnv(example, online);
    const parsed = parseEnvironment(parseDotenv(rendered));
    expect(parsed.ONLINE).toBe(true);
    expect(parsed.DATABASE_URL).toContain("localhost:5443/devgame");
    expect(parsed.BETTER_AUTH_SECRET?.length).toBe(64);
    expect(parsed.DAILY_SEED_SECRET?.length).toBe(64);
    expect(parsed.CRON_SECRET?.length).toBe(64);
    expect(parsed.ADMIN_PASSWORD?.length).toBe(24);
    expect(parsed.ADMIN_PORT).toBe(3100);
    expect(parsed.GOOGLE_CLIENT_ID).toBeUndefined();
    // Two machines never share a secret.
    expect(renderEnv(example, online)).not.toBe(renderEnv(example, online));
    // Everything else is the example, line for line: the comments included.
    expect(rendered).toContain("# Google OAuth — the primary way people sign in.");
  });

  test("moves the database port with POSTGRES_PORT", () => {
    const parsed = parseEnvironment(
      parseDotenv(renderEnv(example, { offline: false, postgresPort: "5500" })),
    );
    expect(parsed.DATABASE_URL).toContain("localhost:5500/devgame");
  });

  test("copies an offline .env with no database", () => {
    const parsed = parseEnvironment(
      parseDotenv(renderEnv(example, { offline: true, postgresPort: "5443" })),
    );
    expect(parsed.ONLINE).toBe(false);
    expect(parsed.DATABASE_URL).toBeUndefined();
  });

  test("keeps a value the example already fills in", () => {
    const filled = example.replace(
      'BETTER_AUTH_SECRET=""',
      'BETTER_AUTH_SECRET="kept-as-written-0123"',
    );
    const parsed = parseDotenv(renderEnv(filled, online));
    expect(parsed.BETTER_AUTH_SECRET).toBe("kept-as-written-0123");
  });

  test("reads its flags, and never touches an existing file unless forced", async () => {
    const options = parseInitArgs(["--no-docker", "--force"], { POSTGRES_PORT: "5500" });
    expect(options.docker).toBe(false);
    expect(options.force).toBe(true);
    expect(options.postgresPort).toBe("5500");
    expect(options.example).toBe(EXAMPLE);
    expect(options.fixtures).toBe(true);
    expect(parseInitArgs(["--offline"], {}).docker).toBe(false);
    expect(parseInitArgs(["--no-fixtures"], {}).fixtures).toBe(false);

    const dir = mkdtempSync(join(tmpdir(), "devgame-init-"));
    const target = join(dir, "nested", ".env");
    const base = { docker: false, fixtures: false, example: EXAMPLE, target, postgresPort: "5443" };
    await init({ ...base, offline: true, force: false });
    expect(existsSync(target)).toBe(true);
    const first = readFileSync(target, "utf8");
    await init({ ...base, offline: false, force: false });
    expect(readFileSync(target, "utf8")).toBe(first);
    await init({ ...base, offline: false, force: true });
    expect(readFileSync(target, "utf8")).not.toBe(first);
    expect(readFileSync(target, "utf8")).toContain("\nDATABASE_URL=");
  });

  test("says what to do when the example is gone", async () => {
    const dir = mkdtempSync(join(tmpdir(), "devgame-init-"));
    await expect(
      init({
        offline: true,
        docker: false,
        fixtures: false,
        force: false,
        target: join(dir, ".env"),
        example: join(dir, ".env.example"),
        postgresPort: "5443",
      }),
    ).rejects.toThrow("git checkout .env.example");
  });
});
