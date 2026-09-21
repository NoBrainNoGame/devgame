---
description: Change a rule in the engine, decide the rules epoch, and re-measure
argument-hint: <what the rule should now do>
---

Change the rule described by `$ARGUMENTS`.

A rule is code in `src/game/core/rules/` or `src/game/core/map/`. If what you
are about to change is a number, stop: that belongs in
`src/game/core/balance.ts` and in `/tune-balance`.

1. Check the change against `docs/game-design.md`. The engine implements that
   spec, and a rule contradicting it is a bug in one of the two — say which
   before you write anything.
2. **Measure first.** `bun run sim --runs 300` and keep the output. You cannot
   report a before/after without a before.
3. Make the change. Any new constant it needs goes in `balance.ts`, under the
   section it belongs to, with a comment saying what it is in game terms. A
   literal inside a rule is untunable and invisible to the fingerprint.
4. Keep the engine pure: no `Date.now()`, no `Math.random()`, no `@/lib`, no
   React. Randomness is `context.rng` only, and the order of draws is part of
   the save — an added or removed `rng` call changes every recorded run.
5. **Decide `RULES_EPOCH`.** The fingerprint hashes the balance table and the
   content ids; it cannot see a change to rules code. Ask the only question
   that matters: does an old action log now replay to a different game? If yes,
   bump `RULES_EPOCH` in `src/game/dto/version.ts` and add a numbered line to
   its doc comment saying what changed. State your reasoning explicitly — "no
   epoch bump because this only changes a log line" is an acceptable answer,
   "I did not think about it" is not.
6. `bun run sim --runs 300` with the same seed as step 2.
7. `bun run check`. `tests/content.test.ts` will fail on the pinned
   `RULES_FINGERPRINT` if the epoch moved; update the literal.

Report:

- what the rule does now that it did not before, in one sentence;
- the epoch decision and the reason;
- the before/after distributions side by side — `ends`, `turns med/p10/p90`,
  `score med/p90`, `sprints avg`, `debt peak avg`, and the `failures` line —
  for every policy, and whether `invariant failures` is still 0.

You will NOT: tune a balance number to hide a rule's effect, bump
`SAVE_VERSION` (that is a save-shape change, not a rules change), touch
`prisma/` or `messages/` beyond a key the new rule emits, or report a
before/after measured on different seeds.
