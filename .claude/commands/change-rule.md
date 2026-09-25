---
description: Change a rule in the engine, decide the rules epoch, and re-measure
argument-hint: <what the rule should now do>
---

Change the rule in `$ARGUMENTS`. Rules are code in `src/game/core/rules/` or
`src/game/core/map/`; a number belongs in `src/game/core/balance.ts`
(`/tune-balance`).

1. Check it against `docs/game-design.md`, the spec the engine implements; if
   they would disagree, say which is wrong before writing anything.
2. **Measure first**: `bun run sim --runs 300`, output kept.
3. Make the change. New constants go in `balance.ts`, in their section,
   commented in game terms; a literal in a rule is untunable and invisible to
   the fingerprint.
4. Stay pure: no `Date.now()`, `Math.random()`, `@/lib` or React. Randomness is
   `context.rng` only, and draw order is part of the save: adding or removing
   an `rng` call changes every recorded run.
5. **Decide `RULES_EPOCH`.** The fingerprint hashes the balance table and
   content ids, not rules code. If an old action log now replays to a
   different game, bump it in `src/game/dto/version.ts`, with a numbered line
   in its doc comment and a `RULES_EPOCHS` row. (Unpublished game: it stays 1
   — see that comment.) Give your reasoning: "no bump, only a log line
   changed" is fine; "I did not think about it" is not.
6. `bun run sim --runs 300`, same seed as step 2.
7. `bun run check`. If the epoch moved, repin `RULES_FINGERPRINT` in
   `tests/content.test.ts`.

Report: what the rule now does, in one sentence; the epoch decision and why;
for every policy, before/after side by side for `ends`, `turns med/p10/p90`,
`score med/p90`, `sprints avg`, `debt peak avg` and the `failures` line; and
whether `invariant failures` is still 0.

Never: tune a balance number to hide the rule's effect; bump `SAVE_VERSION`
(save shape, not rules); touch `prisma/` or `messages/` beyond a key the rule
emits.
