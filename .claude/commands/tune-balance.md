---
description: Move one balance number towards a target and measure whether it worked
argument-hint: <knob> <target>
---

Tune the knob in `$ARGUMENTS` towards its target, e.g. `energy.restRegen target
a median run of 40 turns` or `crunchThreshold so the ai policy stops burning
out in 80% of runs`.

1. Find the knob in `src/game/core/balance.ts` and read its comment. If nothing
   there can reach the target, say so and stop: that is `/change-rule`.
2. **Measure first**: `bun run sim --runs 300`, whole output kept; note the
   target's number.
3. Edit **only** `src/game/core/balance.ts` (never `src/game/core/rules/`,
   `src/game/core/map/` or `src/game/content/`), one knob at a time unless the
   target names two: three at once says nothing about which did the work.
4. `bun run sim --runs 300`, same seed and run count.
5. Iterate if it missed. Report every attempt, wrong-way ones included: a knob
   that does not move the metric is a finding.
6. Repin `RULES_FINGERPRINT` in `tests/content.test.ts`; any `BALANCE` number
   changes it, and the failing test prints the new value.
7. Decide `RULES_EPOCH`. The fingerprint already makes old runs
   incomparable, but boards filter on the epoch: bump it (doc-comment line,
   `RULES_EPOCHS` row) if finished runs on today's boards should stop ranking
   against post-change ones. (Unpublished game: it stays 1 — see its comment in
   `src/game/dto/version.ts`.) Say which you chose.
8. `bun run check`. Some `tests/rules.test.ts` assertions are hard-coded, not
   derived from `BALANCE` (a `ci` level worth exactly `+10`): fix the
   expectation, not the rule.

Report in numbers whether the effect happened: the target metric before and
after, and what else moved. A knob that hit its target but sent another
policy's median off a cliff is the headline.

Never weaken a test to fit a number.
