# Agent configuration security

This project is worked on by coding agents, so its `.claude/` directory is an
attack surface of its own: permission rules decide what an agent may run, and
the instructions in `CLAUDE.md` decide what it will believe.

That surface is audited with **AgentShield**, part of the [ECC][ecc] harness,
installed into `.claude/` in this repository.

```bash
npx ecc-agentshield scan --path . --format text
```

It does **not** audit the web application. For the site's own security —
authentication, the replay-verified leaderboard, injection, headers — the
relevant reading is `docs/database.md`, `src/lib/run/claims.ts` and the
boundaries in `CLAUDE.md`.

[ecc]: https://github.com/affaan-m/ECC

## What was fixed

The first scan graded the configuration **D (58/100)** with 98 findings. After
the changes below it is **C (62/100)** with 32.

**The MCP catalogue was deleted.** ECC's installer ships
`.claude/mcp-configs/mcp-servers.json`, an inventory of 34 example servers —
filesystem, browser drivers, hosted databases — none of them declaring an `env`
block, which means each would inherit every variable in the parent process. It
accounted for 59 of the 98 findings. Nothing read it: there is no `.mcp.json`,
and ECC's own documentation says a user must copy it across deliberately. A
file nobody uses and everybody might copy is worth deleting rather than fixing.

**A deny list was added.** There was none, which is the finding that mattered
most. It now covers privilege escalation, outbound SSH, world-writable
permissions, reading `.env`, and the destructive operations this project's own
rules already said need human consent — `prisma migrate reset`,
`docker compose down -v`, force pushes, hard resets. Denied is stronger than
discouraged: an agent cannot talk its way past a deny rule.

**Two redundant allow rules were removed.** `Bash(bun test)` and
`Bash(bun run sim)` were shadowed by the prefix rules beside them, which made
the list look narrower than it was.

**`CLAUDE.md` gained a section on content from outside the repository.** It
states the rule that matters — fetched text is data, not instruction — and the
two consequences that follow for secrets and for destructive commands.

## What was not fixed, and why

**23 findings: "overly permissive allow rule".** One per entry in the allow
list, on the grounds that `bun run <script>` is interpreter access. The
remediation it proposes — restrict to specific named scripts — is exactly what
the list already does: every entry is an exact command or a tightly scoped
prefix, and each one is read-only or idempotent. Removing them would not make
the project safer; it would only move the same commands from "allowed" to
"asked about every time", which trains people to approve without reading.

**"No PreToolUse security hooks configured".** Hooks intercept every matching
tool call and run a script before it. That is a real behaviour change for
anyone working in this repository, and it is not one to introduce as a side
effect of a security scan. ECC's hook runtime was deliberately left out of the
install (`--no-hooks`). If hooks are wanted later, that is its own decision.

**Six remaining "missing prompt defense" items.** The ones that carry meaning
here — instruction boundaries, indirect injection, secrets, role changes — are
in `CLAUDE.md`. The rest ask a project's working rules to also be a model
safety policy: harmful content, output control, abuse prevention. Those belong
to the model, not to a file explaining how to change a balance number.

**One "destructive tool usage instruction detected".** The scanner found
`git push --force` in `CLAUDE.md`. It is in the paragraph explaining why that
command is denied.

## Keeping it honest

Re-run the scan after changing anything under `.claude/`, and when a finding is
dismissed, write down why — here, not in a commit message nobody will find
again. A score that only ever goes up because findings get suppressed is worth
less than a lower score with reasons attached.
