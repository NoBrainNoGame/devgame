---
description: Move one balance number towards a target and measure whether it worked
argument-hint: <knob> <target>
---

Tune the knob named in `$ARGUMENTS` towards the target it states — for example
`aiJump target a median run of 40 turns`, or `crunchThreshold so the ai policy
stops burning out in 80% of runs`.

1. Find the knob in `src/game/core/balance.ts` and read its comment. If the
   target cannot be reached from anything in that file, say so and stop — the
   answer is a rule change, and that is `/change-rule`.
2. **Measure first.** `bun run sim --runs 300` and keep the whole output. Note
   the specific number the target is about.
3. Edit **only** `src/game/core/balance.ts`. One knob at a time unless the
   target genuinely names two; moving three at once tells you nothing about
   which one did the work.
4. `bun run sim --runs 300`, same seed, same run count.
5. Iterate if it missed. Report every attempt, including the ones that went the
   wrong way — a knob that does not move the metric is a finding.
6. Update the pinned fingerprint in `tests/content.test.ts`: changing any
   number in `BALANCE` changes `RULES_FINGERPRINT`, and the test will tell you
   the new value when it fails.
7. Ask whether `RULES_EPOCH` should move too. A balance change already makes
   old runs incomparable via the fingerprint, but the leaderboard filters on
   the epoch — bump it if finished runs on today's boards should stop being
   ranked against post-change ones. Say which you chose.
8. `bun run check`. Some assertions in `tests/rules.test.ts` are hard-coded
   rather than derived from `BALANCE` (a `ci` level being worth exactly `+10`,
   for one); fix the expectation, not the rule.

Report whether the intended effect actually happened, in numbers: the metric
the target named, before and after, plus what else moved. If the knob hit its
target but sent another policy's median off a cliff, that is the headline, not
a footnote.

You will NOT: edit anything under `src/game/core/rules/`, `src/game/core/map/`
or `src/game/content/` — this command touches `balance.ts`, the pinned
fingerprint in `tests/content.test.ts`, and nothing else. It will not weaken a
test to make a number fit, and it will not claim a target was met on a sample
measured with a different `--seed` or `--runs`.
