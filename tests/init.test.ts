import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseEnvironment } from "@/lib/env";

import { init, parseInitArgs, renderEnv } from "../scripts/init";

/**
 * `bun run init` writes a `.env` the app accepts: online with random secrets
 * of the right length, or offline with no database at all.
 */

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
  test("writes an online .env the schema accepts, with fresh secrets", () => {
    const parsed = parseEnvironment(
      parseDotenv(renderEnv({ offline: false, postgresPort: "5443" })),
    );
    expect(parsed.ONLINE).toBe(true);
    expect(parsed.DATABASE_URL).toContain("localhost:5443/devgame");
    expect(parsed.BETTER_AUTH_SECRET?.length).toBe(64);
    expect(parsed.DAILY_SEED_SECRET?.length).toBe(64);
    expect(parsed.CRON_SECRET?.length).toBe(64);
    expect(parsed.GOOGLE_CLIENT_ID).toBeUndefined();
    // Two machines never share a secret.
    expect(renderEnv({ offline: false, postgresPort: "5443" })).not.toBe(
      renderEnv({ offline: false, postgresPort: "5443" }),
    );
  });

  test("writes an offline .env with no database", () => {
    const parsed = parseEnvironment(
      parseDotenv(renderEnv({ offline: true, postgresPort: "5443" })),
    );
    expect(parsed.ONLINE).toBe(false);
    expect(parsed.DATABASE_URL).toBeUndefined();
  });

  test("reads its flags, and never touches an existing file unless forced", async () => {
    const options = parseInitArgs(["--no-docker", "--force"], { POSTGRES_PORT: "5500" });
    expect(options.docker).toBe(false);
    expect(options.force).toBe(true);
    expect(options.postgresPort).toBe("5500");
    expect(options.fixtures).toBe(true);
    expect(parseInitArgs(["--offline"], {}).docker).toBe(false);
    expect(parseInitArgs(["--no-fixtures"], {}).fixtures).toBe(false);

    const dir = mkdtempSync(join(tmpdir(), "devgame-init-"));
    const target = join(dir, "nested", ".env");
    const base = { docker: false, fixtures: false, target, postgresPort: "5443" };
    await init({ ...base, offline: true, force: false });
    expect(existsSync(target)).toBe(true);
    const first = readFileSync(target, "utf8");
    await init({ ...base, offline: false, force: false });
    expect(readFileSync(target, "utf8")).toBe(first);
    await init({ ...base, offline: false, force: true });
    expect(readFileSync(target, "utf8")).not.toBe(first);
    expect(readFileSync(target, "utf8")).toContain("DATABASE_URL=");
  });
});
