---
description: Add a skill, relic, DevOps node, bot archetype, event, node kind or starter profile
argument-hint: <kind> <name>
---

Add the game element described by `$ARGUMENTS` — the kind first, then a name or
a short description of what it should do.

Follow the checklist for that kind in `docs/maintenance.md`, under "Adding a
game element". Do not improvise an order: read the section for the exact kind
before touching anything.

In every case:

1. Add the id to its frozen array and the entry to its `Record` in
   `src/game/content/`. Both, in the same edit.
2. Express the effect with an existing field of `Effects`
   (`src/game/content/effects.ts`). If none fits, add the field to **both** the
   interface and `NO_EFFECTS`, then read it in `src/game/core/rules/` — a field
   nothing reads is silently inert and no test catches it.
3. Add the two message entries to **both** `messages/fr.json` and
   `messages/en.json` (`name`/`desc`, except events, which take `title`/`log`).
4. Handle the kind-specific wiring the doc names — a bot skill needs to be some
   archetype's `trophy`; a free-from-the-start feature skill needs
   `SKILLS_UNLOCK_FREE` in `src/game/core/run.ts` *and* `emptyMeta()` in
   `src/game/dto/meta.ts`, or it never appears on a map; a failure event needs
   a `case` in `resolveFailure`; a node kind needs a glyph, an energy price, a
   placement and a branch in `arriveAt`.
5. Decide whether `RULES_EPOCH` moves, using the table in `docs/maintenance.md`.
   Say which way you decided and why. If it moves, bump it in
   `src/game/dto/version.ts` and add a numbered line to its doc comment.
6. Update the pinned `RULES_FINGERPRINT` literal in `tests/content.test.ts` —
   adding any content id changes it.

Then run the tests that cover the kind, not the whole suite first:

- always `bun test tests/content.test.ts tests/messages.test.ts`
- events: `bun test tests/events.test.ts`
- bots: `bun test tests/bots.test.ts`
- relics: `bun test tests/sprint.test.ts`
- node kinds: `bun test tests/map.test.ts`
- DevOps: `bun test tests/actions.test.ts tests/rules.test.ts`

Finish with `bun run check`, and `bun run sim --runs 200` if the element enters
a pool the RNG draws from.

You will NOT: change a number in `src/game/core/balance.ts` to make the new
element feel right (that is `/tune-balance`), edit a rule module beyond the
minimum the new element requires, touch `prisma/` or `src/lib/`, or leave a
message key in one catalogue and not the other.
