---
description: Find engine keys the catalogues lack, and catalogue keys nothing emits
---

Audit `messages/fr.json` and `messages/en.json` against what the engine
actually emits.

`bun test tests/messages.test.ts` already covers part of this: identical key
sets between the two files, no empty message, matching ICU placeholder names,
and every content-derived key (`game.skills.*`, `relics`, `devops`, `bots`,
`profiles`, `events`, `nodes` — `name`/`desc`, or `title`/`log` for events).
Run it first and do not repeat what it proves.

**What it does not cover, and what this command is for:** keys that are not
derived from a content table. Everything under `game.log.*` and `game.notes.*`
is written by hand in the engine, and a missing one renders as a raw
`log.node_done.ai` in a player's commit log while the whole suite stays green.

1. Collect what the engine emits. The call sites are `text(...)` and `ref(...)`
   from `src/game/core/i18n.ts`:
   ```bash
   grep -rn "text(\`\|text(\"\|ref(\`\|ref(\"" src/game src/components | sort
   ```
   `src/game/core/log.ts` is the log lines, `src/game/core/rules/preview.ts`
   is the HUD notes. **Expand every template literal by hand.** A key built
   from `${event.mode}` is two keys, `log.node_done.craft` and
   `log.node_done.ai`; one built from `${archetype}` is one key per
   `BOT_ARCHETYPE_IDS` entry. Enumerate every branch of every union — that is
   where the misses hide.
2. Flatten both catalogues to dotted paths and compare, the way
   `tests/messages.test.ts` does. A throwaway `bun` script is fine.
3. Report two lists:
   - **emitted but missing** — a key the engine can produce that neither
     catalogue has. This is a bug a player will see; name the emitting file and
     line.
   - **present but never emitted** — a catalogue key nothing in `src/` looks
     up. Usually dead weight from a removed feature. Check it is not referenced
     from a React component with `useTranslations` before calling it dead:
     ```bash
     grep -rn "<key fragment>" src/
     ```
     Namespaces outside `game` (`common`, `nav`, `hud`, `errors`, …) are read
     by components, not the engine — do not report those as orphans without
     checking.
4. If you add a missing key, add it to **both** files with the same ICU
   placeholder names. FR is the source of truth; EN is kept in step with it.

Finish with `bun test tests/messages.test.ts`.

You will NOT delete a catalogue key on suspicion alone — report it and let a
human decide, because a key reached through a template literal is easy to miss
with grep. You will not add a key to one catalogue and not the other, invent a
French or English string for a key whose meaning you cannot determine from its
call site, or change the engine to emit a key that already exists rather than
adding the one it needs.
