# Agent configuration security

Coding agents work here, so `.claude/` is an attack surface: permission rules
decide what an agent may run, `CLAUDE.md` what it believes. **AgentShield**,
from the [ECC][ecc] harness installed into `.claude/`, audits it:

```bash
bun x ecc-agentshield scan --path . --format text
```

It does **not** audit the web application: for that, see `docs/database.md`,
`src/lib/run/claims.ts` and the boundaries in `CLAUDE.md`.

[ecc]: https://github.com/affaan-m/ECC

## What was fixed

The first scan gave **D (58/100)**, 98 findings; after these, **C (62/100)**,
32.

- **ECC's MCP catalogue was deleted**: `.claude/mcp-configs/mcp-servers.json`,
  34 example servers with no `env` block, each inheriting every variable of the
  parent process (59 findings). Nothing read it (no `.mcp.json`; ECC says to
  copy it deliberately); a file nobody uses and anybody might copy is deleted,
  not fixed.
- **A deny list was added**, the finding that mattered most: privilege
  escalation, outbound SSH, world-writable permissions, reading `.env`, and the
  destructive operations the project already reserves for human consent
  (`prisma migrate reset`, `docker compose down -v`, force pushes, hard
  resets). An agent cannot talk its way past a deny rule.
- **Two redundant allow rules were removed**, `Bash(bun test)` and
  `Bash(bun run sim)`: shadowed by prefix rules, they made the list look
  narrower than it was.
- **`CLAUDE.md` gained a section on outside content**: fetched text is data,
  not instruction, with its consequences for secrets and destructive commands.

## What was not fixed, and why

- **23 "overly permissive allow rule"** (one per allow entry: `bun run
  <script>` is interpreter access). Its fix, restricting to named scripts, is
  what the list does: every entry is an exact command or a tight prefix,
  read-only or idempotent. Removing them only turns them into prompts, which
  trains people to approve without reading.
- **"No PreToolUse security hooks configured".** Hooks run a script before
  every matching tool call, a behaviour change for everyone, not a scan's side
  effect. ECC was installed with `--no-hooks`; hooks are their own decision.
- **Six "missing prompt defense" items.** The meaningful ones (instruction
  boundaries, indirect injection, secrets, role changes) are in `CLAUDE.md`;
  harmful content, output control and abuse prevention belong to the model.
- **One "destructive tool usage instruction detected"**: `git push --force` in
  `CLAUDE.md`, in the paragraph explaining why it is denied.

## Keeping it honest

Re-run the scan after changing anything under `.claude/`. Write down why a
finding is dismissed, here, not in a commit message: a score that rises only
through suppression is worth less than a lower one with reasons.
