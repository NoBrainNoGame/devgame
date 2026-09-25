---
description: Find engine keys the catalogues lack, and catalogue keys nothing emits
---

Audit `messages/fr.json` and `messages/en.json` against what the engine emits.

Run `bun test tests/messages.test.ts` first; do not repeat what it proves:
identical key sets, no empty message, matching ICU placeholders, French
typography, and every content-derived key (`game.skills`, `relics`, `tree`,
`upgrades`, `acquisitions`, `objectives`, `profiles`, `events`, `narrative`,
`competitors`, `subjects`, `features`, `system`, `branches`, `ranks`,
`tickets`, `nodes`).

This command covers keys written by hand in the engine, under `game.log.*` and
`game.notes.*`: a missing one shows a raw `log.node_done.ai` in the player's
log while the suite stays green.

1. Collect the `text(...)` and `ref(...)` calls (`src/game/core/i18n.ts`):
   ```bash
   grep -rn "text(\`\|text(\"\|ref(\`\|ref(\"" src/game src/components | sort
   ```
   Log lines live in `src/game/core/log.ts`, HUD notes in
   `src/game/core/rules/preview.ts`. **Expand every template literal by
   hand**: `log.node_done.${event.mode}` is `.craft` and `.ai`;
   `log.game_over.${event.reason}` is one key per `GameOverReason`. Enumerate
   every branch of every union; that is where misses hide.
2. Flatten both catalogues to dotted paths and compare, as
   `tests/messages.test.ts` does (a throwaway `bun` script is fine).
3. Report two lists:
   - **emitted but missing** from both catalogues: a bug players will see.
     Name the emitting file and line.
   - **present but never emitted** by anything in `src/`, usually left by a
     removed feature. First check no component reads it via
     `useTranslations`:
     ```bash
     grep -rn "<key fragment>" src/
     ```
     Namespaces outside `game` (`common`, `nav`, `hud`, `errors`, …) are read
     by components, not the engine.
4. Add a missing key to **both** files with the same ICU placeholders. FR is
   the source of truth; EN follows.

Finish with `bun test tests/messages.test.ts`.

Never: delete a key on suspicion (template-literal keys evade grep: report,
let a human decide); invent a string whose meaning the call site does not
settle; make the engine emit an existing key instead of adding the one it
needs.
