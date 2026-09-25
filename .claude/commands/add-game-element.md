---
description: Add a skill, relic, skill tree node, upgrade, developer rank, event, node kind or starter profile
argument-hint: <kind> <name>
---

Add the game element in `$ARGUMENTS` (kind, then name or effect).

Follow that kind's checklist in `docs/maintenance.md`, under
"Adding a game element": read it before touching anything, keep its order.
Always:

1. Id in its frozen array, entry in its `Record` (`src/game/content/`), same
   edit.
2. Effect via an existing `Effects` field (`src/game/content/effects.ts`). If
   none fits, add the field to **both** the interface and `NO_EFFECTS` and read
   it in `src/game/core/rules/`: an unread field is silently inert, and no test
   catches it.
3. Messages in **both** `messages/fr.json` and `messages/en.json`
   (`name`/`desc`; events `title`/`log`).
4. The kind-specific wiring the doc names. E.g. failure event: a `case` in
   `resolveFailure`. Node kind: a `BALANCE.energy.cost` price, a `nodeGlyph`, a
   writer in `src/game/core/rules/write.ts`, a `writeCommit` case (else it
   silently acts as a plain commit). Free skill (`unlockCost: 0`):
   `freeFeatureSkills()` picks it up.
5. Decide whether `RULES_EPOCH` moves with the table in `docs/maintenance.md`,
   and say why. If it moves: bump it in `src/game/dto/version.ts`, add a
   numbered line to its doc comment and a `RULES_EPOCHS` row. (Unpublished
   game: it stays 1 — see that comment.)
6. Repin `RULES_FINGERPRINT` in `tests/content.test.ts`; any new content id
   changes it.

Tests for the kind first:

- always `bun test tests/content.test.ts tests/messages.test.ts`
- events: `bun test tests/events.test.ts`
- sprint bonuses (relics): `bun test tests/relics.test.ts tests/sprint.test.ts`
- node kinds: `bun test tests/map.test.ts`
- tree nodes: `bun test tests/actions.test.ts tests/rules.test.ts`
- upgrades, ranks: `bun test tests/economy.test.ts tests/team.test.ts`

Then `bun run check`, and `bun run sim --runs 200` if the element enters a pool
the RNG draws from.

Never: change a number in `src/game/core/balance.ts` to make it feel right
(`/tune-balance`); edit a rule module beyond the minimum; touch `prisma/` or
`src/lib/`.
