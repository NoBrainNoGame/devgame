# Maintenance

What to change, in what order, and what breaks silently. Rules:
`docs/game-design.md`; what code may not do: `CLAUDE.md`.

- **A run is `seed + ordered actions`.** The server replays it to score;
  changing what it replays to makes a new game.
- **The engine is pure.** `src/game/core/`, `src/game/content/`: no clock, no
  `Math.random()`, no `@/lib`. Randomness is the `state.rng` cursor; draw order
  is part of the save.

Paths: `content/`, `core/`, `dto/`, `bridge/`, `render/` sit in `src/game/`;
`rules/`, `map/` in `src/game/core/`; `lib/` is `src/lib/`; `*.test.ts` in
`tests/`.

## Adding a game element

Every kind, unless noted:

- A table in `content/`: frozen id array + `Record` keyed by it, re-exported by
  `content/index.ts`.
- Messages in **both** `messages/fr.json` and `messages/en.json`;
  `messages.test.ts` derives content keys from the id arrays
  ([list](#adding-or-changing-translated-text)) and names a missing id.
- `content.test.ts`: unique ids, `.id` = key, **no effect field outside
  `EFFECT_KEYS`** (from `NO_EFFECTS`), values of the declared type.
- A new id moves `RULES_FINGERPRINT` (it hashes the id lists): repin its literal
  in `content.test.ts`, decide the epoch ([table](#the-rules_epoch-decision)).
- Check: `bun test tests/content.test.ts tests/messages.test.ts`, "+x" adding
  `tests/x.test.ts`; if balance can move, `bun run sim --runs 200`, same seed
  before and after.

### A skill

1. `SKILL_IDS` + `SKILLS` (`content/skills.ts`): `effects`, `unlockCost`;
   `game.skills.<id>.name`/`.desc`. No fitting field:
   [below](#when-no-effect-field-fits).
2. No wiring: a run gains it by delivering a ticket carrying it
   (`rules/grants.ts`) or from its profile's `startingSkills`. Tickets draw from
   `availableSkills()` (`rules/sprint.ts`: unlocks minus earned minus promised
   on the board); `drawTicket` (`map/tickets.ts`) takes any pool.
3. `unlockCost: 0`: in `freeFeatureSkills()` (`content/skills.ts`), sole source
   for `createRun` and `emptyMeta()`. Else `applyRunToMeta`
   (`lib/profile/progression.ts`) unlocks it once that many commits are banked.

Check: sim; no policy's scores move beyond noise.

### A sprint bonus (a "relic", in the code)

1. `RELIC_IDS` + `RELICS` (`content/relics.ts`) via `boost(id, effect, when?)`
   or `keep(id, effects)` (`RELIC_BOOST_IDS`/`RELIC_KEEP_IDS` derive);
   `game.relics.<id>.name`/`.desc`.
2. **Boost**: a `BoostEffect` applied once by `applyBoost` (`rules/relics.ts`)
   through ordinary channels (energy, debt, quality, money, share, dev, ticket).
   New effect: an optional `BoostEffect` field + an `applyBoost` branch. What
   outlives the pick (discount, free hire, extra turns, boosted paydays) sits in
   `RunState.boosts` (`PendingBoosts`), spent by its rule (`shop.ts`,
   `team.ts`, `reducer.ts`, `economy.ts`).
3. `when`: a `RelicCondition` tested by `holds` (`rules/relics.ts`), so a
   useless boost is not offered; thresholds in `BALANCE.relics`.
4. **Keep**: permanent `effects`, gathered each turn like a skill's; never what
   the shop or tree sells.
5. Add boosts to `BOOST_PREFERENCE` (`scripts/lib/policy.ts`): the sim sorts by
   `indexOf`, so a missing one (`-1`) always wins.
6. **Always moves the epoch**: the offer is two `rng.shuffle`s over eligible
   keeps and boosts.

Check: +relics +sprint (`sprint.relicOffer` distinct cards,
`relics.keepsPerOffer` keeps; each boost tested against its description: add
yours); sim; the admin Balance page's `relicsOffered`/`relicsChosen` pick
rates: rewrite a card nobody takes.

### A skill tree node

1. `TREE_IDS` + `TREE` (`content/tree.ts`), `branch` from `TREE_BRANCHES`;
   `game.tree.<id>` messages.
2. `cost` indexed from level 0: **length = `maxLevel`**, prices > 0,
   `treeCost(id, maxLevel)` `undefined` (tested).
3. `perLevel` is one level; levels sum, so booleans cannot level (`review_bot`:
   `freeReviewEvery: 1` per level, made a cadence by `freeReviewCadence()`,
   `rules/modifiers.ts`).
4. `requires`: **same branch** (the connector is drawn inside the branch's
   panel), no cycle (tested). `canPlaceTree` (`rules/tree.ts`) hides locked
   nodes; the preview names what is missing.
5. Drawing (`components/hud/`): a cell in `TREE_LAYOUT` (`treeLayout.ts`,
   three columns, under its requirements, no connector through another node —
   `tests/tree-layout.test.ts`) and an icon in `ICONS` (`SkillTree.tsx`);
   both are typed by `TreeNodeId`, so a missing one does not compile. New
   branch: `game.branches.<id>.name` and a colour in `ACCENTS`.
6. No action wiring: `getAvailableActions`, `gatherEffects` iterate `TREE_IDS`;
   `PlayerActionSchema` uses `z.enum(TREE_IDS)`.
7. No randomness: appended **last**, old logs replay unchanged (fingerprint and
   `state.tree` shape still change).

Point sources: game-design, *Compétences et arbre* (`BALANCE.tree.perSprint`,
`accountSkillPoints(level)` in `core/score.ts`, `buy_point`, and
`grantSkillPoints` callers). The save declares `startingSkillPoints`;
`overclaims` checks them against `meta.level`.

Check: +actions +rules.

### An upgrade

1. `UPGRADE_IDS` + `UPGRADES` (`content/upgrades.ts`): `category`, `tier`
   (first shown), `price: { base, growth }` (level *n*:
   `round(base × growth^n)`), `maxLevel` (omit: endless), `upkeep` (monthly per
   level; 0: one-off), `perLevel`, `hires` (a site's team);
   `game.upgrades.<id>`.
2. Infra rung: a tier above the last, ten times as big, same price per user
   (tested).
3. Readers: `rules/economy.ts` (`infraCapacity`, `infraCapacityPct`,
   `mrrBonusPct`), `rules/team.ts` (`teamSeats`, `devSpeedBonus`,
   `devCapacityBonus`, `hiringDiscountPct`), HUD (`autopilot` level).
4. No wiring: `Shop.tsx` lists `upgradesIn(category)` plus a greyed next-tier
   rung, in the upgrades dialog (`org`: Sites, in the company dialog's Team
   tab, and never lights the upgrades button); `getAvailableActions` offers `buy`
   as tier and money allow; `buyUpgrade` (`rules/shop.ts`) refreshes effects
   and energy ceiling and hires a site's team via `addDev`. No randomness.

Check: +economy; sim `money` line `upgrades avg`: does the manager buy it?

### A developer's name and colour

`DEV_NAMES` (`content/team.ts`) is hashed from seed and dev id by `nameFor`
(`rules/team.ts`), never drawn: hiring leaves the PRNG alone (`team.test.ts`).
Append to add. Colour `devColourIndex(id)`: serial mod `DEV_COLOUR_COUNT`,
player 0. `DEV_COLOURS` (`render/theme.ts`, canvas) and `--color-dev-<n>`
(`globals.css`, HUD) are compared by `theme.test.ts`: change both and the
constant together.

### A developer rank

`DEV_RANK` (`content/team.ts`): `capacity`, `speed` (points/turn), `hireCost`,
`salary`, `tier` (first hireable). Append to `DEV_RANKS` (the ladder `nextRank`
walks); `game.ranks.<id>.name`. `hire` is offered per rank as tier, seats
(`maxSeats`: head office + sites) and money allow; every join (hire, site,
acquisition, boost) goes through `addDev`. `workTeam` (`rules/team.ts`: pick up,
write, land) is board-driven on purpose: no success roll, debt or energy, its
only draw `maybeSpawnObstacle` after each team commit. Changing that is a rule
change (`team.test.ts`).

### A sound

`sfxFor` (`src/game/audio/sfx.ts`) is exhaustive over events: a new event needs
a sound or `null` there to compile. New sound: `SFX_IDS` id, `null` in
`SFX_FILES` (`manifest.ts`) until a file exists, a `sfxFor` case. The storyboard
puts `sfx` after the event's effect; `audio.test.ts`: one step per mapped event,
none before its node's reveal. The engine never imports `audio/`.

### A word that changes with the tier

`hud.tiered.t<n>.<key>` overrides `hud.<key>`; `useTiered(tier)` takes the
highest tier ≤ the run's, else the base. `messages.test.ts` refuses a tiered key
(`hud.tiered.*` or `play.tiered.*`) without a base. System line: a `SystemNote` member
(`core/types.ts`), `game.system.t3..t6.<note>`, the note in the test's
hard-coded list, `systemNote(context, note)` (`rules/voice.ts`) from the rule
that knows; silent below `BALANCE.voice.firstTier` (3).

### A sprint objective

`OBJECTIVES` (`content/objectives.ts`): `weight`, `minTier`, `requires` (kind
that must be waiting), `reward`, `failPatience`. Add to `targetOf`,
`objectiveProgress`, `objectiveMet` (`rules/objectives.ts`);
`game.objectives.<id>.{name,desc}`, `hud.objectiveProgress.<id>`. New counter:
`SprintCounters`, reset in `drawObjective`, incremented in the rule that knows,
never the HUD.

### A narrative event

`NARRATIVE_EVENTS` (`content/narrative.ts`): `source`, `trigger`, `weight`,
`minTier`/`maxTier`, `minSprint` (≥ 2), `once`, `needsDev`/`needsCompetitor`,
exactly two `choices`; `game.narrative.<id>.{title,text,choices.<choice>}` in
the voice of `docs/lore.md`. A personal question: `profile` (asked of that
starter only, so every other starter's draws are untouched) and `competitor`
(named instead of the strongest, eligible only while it is `alive`) — the
starter's `ally` or `rival`, appended after the others. New effect field: an `answerEvent` branch
(`rules/narrative.ts`) + a preview note. `maybeNarrative` always draws twice per
trigger; a draw only when an event opens breaks replay of every run that saw
none (`narrative.test.ts`).

### A ticket kind

`TICKET_KIND` (`content/tickets.ts`): `colour`, `refPrefix`, `teamTakes`,
`countsWip`, `earnsMrr`, `grantsSkill`, `mustWrite`, `deadlineSprints`,
`forcedWhenStale`, `spawnsObstacles`. Add a weight in
`BALANCE.tickets.kinds.weights` (or an own arrival via `arriveTicketOfKind`,
like `debt`), a size in `drawTicket`, a reward in `rewardKind`
(`rules/write.ts`), `game.tickets.<id>.name`, `hud.kindHint.<id>`,
`log.ticket_assigned.<id>`. A sprint's first ticket stays a feature (the landing
demo and `tickets.test.ts` rely on it).

**Obstacles** (rules: game-design, *L'obstacle*) are never drawn from the
board. Code: `maybeSpawnObstacle` (`rules/tickets.ts`, after `writeCommit` and
`writeTeamCommit`), `spawnObstacle` (sets `parentId`), `treeNodeIds` (ticket +
obstacles, read by `unreadAiOn`, `buggedOn`, `mostIndebtedOn` and shipping),
`isReady` (refuses an open obstacle), `getAvailableActions` (`merge`, not
`submit`, on a ready one), `completeObstacle` (`rules/write.ts`:
`obstacle_merge` in the *parent's* column), `checkInvariants`;
`obstacles.test.ts` plays it. New code reading a ticket's commits must decide
if it means the tree.

### A competitor

`COMPETITORS` (`content/competitors.ts`): `baseStrength` (scaled by entry tier),
`aggression` (% growth a month), `entersAtTier`;
`game.competitors.<id>.{name,bio}` in the voice of `docs/lore.md`. The monthly
drift (`rules/market.ts`) draws once per competitor, standing or not, and once
for the merger, so the count ignores the board (a new competitor adds one);
`market.test.ts` replays a run.

### The pull request review

`performSubmit` (`rules/acceptance.ts`) judges a full ticket by
`BALANCE.acceptance` (`bugDetectPct`, `maxDebt`, `pointsPerBug`; game-design,
*La review de PR*). A new refusal: the rule there, a `pr_reviewed` field for the
dialog, a line in `ReviewDialog.tsx`. Keep the rejection force-opening the
oldest backlog ticket (`openTicket(context, backlogTickets(state)[0], true)`):
without it a rejection is cheap.

Check: `bun test tests/acceptance.test.ts`; sim `tickets delivered` vs
`carried over`, and `wip` climbing past three (a rejection spiral).

### An event

Tables in `content/events.ts`, drawn by `rng.weighted` in `rules/events.ts`:
**any addition moves the epoch**. Messages `game.events.<id>.title`/`.log`
(**not** `name`/`desc`). `cancelledByDependabot` drops an entry once the
`dependabot` node (`cancelObsoleteLib`) is placed.

| Ids / table | Drawn | Fields | Wiring |
|---|---|---|---|
| `FAILURE_EVENT_IDS`/`FAILURE_EVENTS` | commit roll missed (`merge_conflict` on rebase only) | `weight`, `requiresUnreviewedAi`, `forbiddenOnHotfix` | A `case` in `resolveFailure` (exhaustive: the one addition the compiler catches) returning a `FailureOutcome`: `conflict` (second decision), `resolve` (written anyway), `retry` (turn lost, nothing written), `resolve_then_incident` (written, incident, hotfix ticket) |
| `MERGE_EVENT_IDS`/`MERGE_EVENTS` | ticket lands, `mergeEventChance` hits | `weight`, `outcome` (`conflict`: choice; `resolve`: lands), `effect`, `noRegen`, `cancelledByDependabot` | None: `drawMergeEvent` applies `effect.energy`/`.debt`; `performMerge` (`rules/acceptance.ts`) reads `outcome`, `noRegen`. New consequence: rule change there |
| `AMBIENT_EVENT_IDS`/`AMBIENT_EVENTS` | sometimes after a landed commit (`succeed`, `rules/commit.ts`) | `weight`, `effect`, `cancelledByDependabot` | None: `drawAmbient` applies `effect.energy`/`.debt`; a third effect is a rule change there |

Check: +events; `bun run sim --runs 300` `failures`: an event absent in 300 runs
has a bad weight or a never-met flag. Merge events are counted by
`events.test.ts` over 300 seeds, not the sim.

### A way of writing a commit (a "detour")

Refactor, fix, risky, squash, docs, rebase are kinds a commit *becomes*, not map
places.

1. Add to `DETOUR_KINDS` (`core/types.ts`; `DetourKind` derives), the `NodeKind`
   union and the hard-coded `DetourKindSchema` (`dto/run.ts`), or saves using it
   fail to parse.
2. Offer it in `offersOf` (`rules/tickets.ts`), the **one** source for actions,
   previews and the commit rule: always, or on a condition like `squash`,
   `rebase`, `fix`, `refactor` (prefer a target on the ticket in hand; random
   offers get ignored).
3. A `BALANCE.energy.cost` price and a `nodeGlyph` glyph (`render/theme.ts`):
   typecheck errors until done. `pointsFor` (`rules/write.ts`) sets what it
   fills (rebase: nothing).
4. Behaviour: `writeCommit` (`rules/write.ts`), or `succeed`
   (`rules/commit.ts`) on a landed roll; both read `commitKindFor`'s kind.
5. `game.nodes.<kind>.{name,desc,aiName}`: the card shows `aiName` for the
   machine ("Rebase IA"), `name` + `hud.byHand` for the player;
   `messages.test.ts` needs `aiName` for each `DETOUR_KINDS` entry.
6. Offered, not drawn, so no RNG itself; its rule almost always draws. Decide
   the epoch on that.

Check: `bun test tests/rules.test.ts`; sim: policies still take it (else it is a
dead button).

### A node kind

Rare; the most places to touch, the least compiler help.

1. The `NodeKind` union (`core/types.ts`).
2. A price in `BALANCE.energy.cost` (`core/balance.ts`,
   `satisfies Record<NodeKind, number>`: typecheck error); `messages.test.ts`
   reads node kinds from it, so demands no translation before.
3. A glyph in `nodeGlyph` (`render/theme.ts`, exhaustive). `laneColour` is
   *not* exhaustive: it falls through to the feature colour.
4. Write it: a node exists only if a rule in `rules/write.ts` writes it
   (`writeCommit` for tickets; `completeMerge`, `writeSprintStart`,
   `writeRelease` for the trunk). Allow a new trunk kind in `checkInvariants`
   (`map/graph.ts`) or tests refuse it.
5. Behaviour in `writeCommit` (special-cases `risky`, `refactor`, `fix`,
   `squash`, `docs`, `rebase`): **a new kind silently falls through** as an
   ordinary commit, no typecheck or test failure.
6. `game.nodes.<kind>.{name,desc}` (+ `aiName` if a detour); the log passes
   `nodes.<kind>.name` to `log.node_done`.
7. **Moves the epoch.**

Check: `bun test tests/map.test.ts` (500 seeds through `checkInvariants`, naming
the broken rule: parents, increasing rows, lane collisions, trunk kinds, work
outside a ticket or column, a column held before a first commit, obstacles,
non-empty cancelled tickets); sim `generation → invariant failures 0`.

### Other rule hooks

- **A setting**: a field of `SettingsSchema` (`dto/meta.ts`) with a
  `.default()` (old metas and old `Profile.settings` rows parse through it, no
  migration) and the same value in `emptyMeta`; changed through `useSettings`
  (`components/settings/`), which dates the change so `mergeMeta` keeps it; a
  control in `GameSettings.tsx` and `settings.*` messages. A sound setting
  reaches the engine in `useAudioSettings` only.
- **The save file** (`dto/saveFile.ts`): it wraps `MetaProgressSchema` and
  `RunSaveSchema`, so a change to either changes it; a change to the wrapper
  itself bumps `SAVE_FILE_VERSION` and keeps reading the old one.
  Check: `tests/save-file.test.ts`.
- **A HUD gauge the canvas moves**: a `GaugeId` and its cue in `planBatch`
  (`render/storyboard.ts`, `gaugePop`: delta and value in the gauge's own
  terms), its value in `readout`/`holdFor` (`bridge/gauges.ts`), a `data-gauge`
  on the element that shows it (`AnimatedGauge` or `AnimatedCounter`), a
  `game.fx.<gauge>` caption. A figure of its own gets a colour of its own: a
  key in `THEME` and in the three other key palettes (`render/palette.ts`, and
  `lerpPalette`), `--color-<name>` in `globals.css`, written by `useAusterity`
  (`tests/theme.test.ts` compares the CSS with `THEME`). Check:
  `tests/storyboard.test.ts`, `tests/gauges.test.ts`.
- **Scene guard**: the picture is rebuilt around a session that never is
  (`bridge/mount.ts`, `bridge/scene.ts`). Anything a chip hangs outside the
  Pixi tree is tied to `sceneContext.signal`: a scene that threw in a frame
  never terminates its chips. Limits in `SCENE_RETRY` (`bridge/sceneGuard.ts`).
- **A modal**: goes through `DialogContent`, whose `ModalCount` counts it
  (`lib/ui/modals.ts`) while its content is mounted; the canvas holds its story
  still while any is open. An action taken in one passes `originOf(event)` to
  `onAct`, so its gains fly from the button.
- **Production's patience**: `raiseQuality` (`rules/quality.ts`) with a
  `QualitySource`, never writing `state.quality`; the source feeds the log line,
  canvas pop and run-over screen, and `RunStats` counts it in that rule (never
  the HUD). New source: `QualitySource` member, `game.log.quality.<source>`,
  `play.firedBy.<source>`, `play.qualitySource.<source>`.
- **Supervisor level**: a `chooseSupervisor` branch (`bridge/supervisor.ts`), a
  `SUPERVISOR_REASONS` entry + `hud.supervisorMove.<reason>`, a level of
  `UPGRADES.ai_supervisor`. A level buys judgement, never autonomy: level 0
  already advances every phase, and level 1 must equal `chooseAutopilot`
  (`autopilot.test.ts`). The landing demo (`bridge/demo.ts`) plays level 3 on
  today's seed: a level change changes the homepage.
- **Showcase** (the demo run; `showcase` in `CreateRunOptions`,
  `ShowcaseOptions` in `core/run.ts`; never saved, replayed or scored): two
  juniors from turn 1, never promoted (`promote`); board topped up to `backlog`
  each sprint (`arriveTickets`), never forcing stale tickets
  (`assignStaleTickets`); speed spread a point per held ticket so columns run
  side by side (`workTeam`); unstoppable (`gameOver`, `releaseDev` no-ops,
  `performSubmit` accepts all, `mergeEventChance` 0, `performCommit` rolls 100,
  `isReady` ignores flagged bugs); forgetful (after each action `reducer.ts`
  calls `forgetOldHistory`, `rules/history.ts`: drops commits over
  `SHOWCASE_KEEP_ROWS` rows behind the head and their merged tickets, keeps
  trunk tips, what the release must still judge, open tickets' commits). Those
  reads (grep `\.showcase` in `core/`) are all of it. `demo.test.ts` (30
  seeds): never ends, keeps its team busy and whole.
- **Hack kind**: `hackOffer`/`performHack` branches (`rules/hack.ts`), a
  `HackKind`, `hud.hack.<kind>`, `game.notes.hack_win.<kind>`/`hack_lose.<kind>`,
  `game.log.hack.<kind>.*`. Rare (`hack.test.ts`: none on an ordinary turn); the
  coin is the only draw, only when the player tries.
- **Idle-clock phase**: an `idleTarget` branch (`bridge/idle.ts`), the move the
  clock presses (the bar shows under its button). An unanswered phase stalls an
  idle run; `autopilot.test.ts` plays every phase.

### A starter profile

1. `PROFILE_IDS` + `PROFILES` (`content/profiles.ts`); `game.profiles.<id>`.
2. `unlockCost` **> 0** except `junior` (tested).
3. `startingSkills`: `SkillId`s granted by `createRun`; `startingTree`: partial
   tree levels.
4. A past: `game.profiles.<id>.lore` and a row in `docs/lore.md`, "Les
   profils"; an `ally` and a `rival` among the house companies (shown in the
   setup's file and as badges on the market), and a personal question for
   each (see "A narrative event").
5. No wiring: `RunSetup.tsx` renders `PROFILE_IDS`, `RunSaveSchema` checks
   `z.enum(PROFILE_IDS)`, `applyRunToMeta` unlocks by banked commits,
   `overclaims` (`lib/run/claims.ts`) refuses a locked profile. No randomness.
6. Profile effects are not in `RULES_FINGERPRINT` (only the ids are): a change
   to one replays that starter's runs differently, which is an epoch bump
   once the game is published.

Check: +claims; `bun run sim --profile <id>` against `junior` on the same
seeds, AI-heavy (`--policy mixed`) as well as by hand.

### When no effect field fits

`Effects` (`content/effects.ts`) is flat and additive on purpose: composition is
a sum and an OR.

1. Add the field to the interface **and** `NO_EFFECTS`: `addEffects` iterates
   `EFFECT_KEYS` (`Object.keys(NO_EFFECTS)`), so a field missing there is
   silently not summed (`content.test.ts` flags the unknown key).
2. Read it: `rules/modifiers.ts` for numbers, `rules/events.ts`/`rules/write.ts`
   for switches.
3. **Nothing catches a field declared, summed, never read**: the element does
   nothing. Prove it in `tests/rules.test.ts`.
4. Positive always helps the player; point fields add to a percent chance. That
   lets `gatherEffects` be a blind sum.

## Changing a rule or a balance number

A **balance number** (`core/balance.ts`) moves `RULES_FINGERPRINT` itself (it
hashes `BALANCE`); a **rule** (`rules/`, `map/` code) moves nothing. All numbers
live in `BALANCE`: one inside a rule changes without marking runs incomparable
(two games on one board), and the sim finds a bad number before fifty human runs
only if it is in one place. **A literal like `0.7` in a rule is a bug**, even
correct: add a `BALANCE` knob in its section, commented in game terms.

### Re-measuring with the simulator

```bash
bun run sim                        # 200 runs, all four policies
bun run sim --runs 500             # more runs, tighter quantiles
bun run sim --policy careful       # one policy: ai | craft | mixed | careful
bun run sim --seed 42              # move the seed window
bun run sim --seed 42 --verbose    # one run, printed turn by turn
```

`scripts/sim.ts`: `--turns N` is the ceiling before `capped` (default 1500).
`--verbose` ignores `--runs`, `--policy all` becomes `mixed`; otherwise it first
checks the graphs of `min(500, runs * 2)` seeds after 40 actions. It plays
`junior`, no unlocks, taking a keep at a sprint bonus else the top
`BOOST_PREFERENCE` boost: nothing about other starters. Policies
(`scripts/lib/policy.ts`) are shared with `bun run fixtures` (the local
database's runs): changing one moves both. Fixtures add `chooseQuit`, burning
runs out on purpose (patient policies never lose under current numbers; boards
need finished runs).

Read honestly:

- `generation → invariant failures` `0`, else a broken graph, not balance
  (`bun test tests/map.test.ts` names it).
- `ends`: **no `stuck`/`capped`**, both `burnout` and `fired` (`caught`, a failed
  hack, is fine). `stuck`: no legal action, or over `MAX_FREE_STREAK` (200)
  free actions in a row: always a bug. `capped`: turn ceiling, a run that
  cannot end.
- `turns` (`med`, `p10`, `p90`): a `p90` ten times the median is bimodal (most
  die early, some never); the median hides it.
- `tickets delivered`/`carried over`/`forced`: carrying more than delivering is
  drowning, never assigned is unpushed. `wip` (extra open tickets per turn) is
  the intended pressure; unchecked, it burns runs out.
- `incidents` vs `ends → fired`: production should fire machine-writing
  policies; careful ones burn out.
- `score`: one huge `max` is luck; compare medians.
- **No policy may dominate**: `craft` doubling the others means AI commits are
  not worth their points. `ai` never reviews or squashes and should die fast;
  compare `mixed`, `careful`.
- `failures` (raw count): a missing id never fires; check
  `requiresUnreviewedAi`/`forbiddenOnHotfix`.

Same seed and run count before and after; quote both.

### Reading real runs before touching a number

Online, the game sends every run (`lib/telemetry/send.ts` → `/api/telemetry`)
at its end, every `CHECKPOINT_EVERY_SPRINTS` (10) sprints and when abandoned;
`ingestSample` (`lib/telemetry/ingest.ts`) replays it, drops failures, stores a
`RunSummary` (`summariseRun`, `core/summary.ts`) in `RunSample`. The admin panel
(`bun run admin`, `scripts/admin.ts`; loopback, needs `ADMIN_PASSWORD`)
**Balance** page aggregates per rules fingerprint (`digestSamples`,
`lib/telemetry/digest.ts`): ends and causes, abandon depth, upgrades and tree
nodes bought, event answers, objective success, tickets delivered vs arrived per
kind, sprint bonus pick rates, idle-clock use. Its Markdown export
(`renderDigestMarkdown`; textarea, download) quotes `BALANCE` whole for a model:
ask which constant to move which way, then confirm with the sim, same seed,
before and after.

- A run counts once, at its best sample: final, else abandoned, else furthest
  checkpoint (`latestPerRun`).
- Only the **current** fingerprint (default filter) describes current rules;
  "all fingerprints" compares before/after.
- New counter: a `RunStats` field (`core/types.ts`, initialised in `createRun`)
  incremented **in the rule**; then `RunSummary`/`summariseRun` and
  `digest.ts`, which lists measures by hand (old rows lack it: default it, like
  `relicsOffered ?? {}`); test in `telemetry.test.ts`.

### The `RULES_EPOCH` decision

`RULES_FINGERPRINT` (`dto/version.ts`) hashes `BALANCE`, the content id lists
and `RULES_EPOCH`: numbers and ids move it, **rules code does not** (a merge fix
changes every replay, no number touched). By hand:

> If the change makes an old action log replay to a **different game**, bump
> `RULES_EPOCH`.

| Change | Epoch |
|---|---|
| A balance number | Yes |
| A sprint bonus; a failure, merge, ambient or narrative event; an objective; a ticket kind; a competitor | Yes: an RNG pool or draw count changes |
| A node kind, anything in `map/tickets.ts` | Yes |
| A rule changing an outcome, cost or draw | Yes |
| A skill, `unlockCost > 0` | No: old saves carry their `unlockedSkills` |
| A skill, `unlockCost: 0` | Yes: it joins the free pool, `rng.pick` on every map |
| Gating an action in `getAvailableActions` | Yes: an old log taking it stops replaying |
| A new detour kind | Not itself (offered, not drawn); its rule is |
| A `PlayerAction` field | Not itself; the rule reading it almost always is |
| A tree node, upgrade, rank or profile id appended | No: nothing is drawn from them |
| Renaming a message, comment, variable | No |

In doubt, bump: bumping restarts a board; not bumping leaves one comparing two
games that looks healthy.

A bump, in one commit: repin `expect(RULES_FINGERPRINT).toBe("…")` in
`content.test.ts`; a line in the `RULES_EPOCH` doc comment on what changed (the
only record of why boards reset); a `RULES_EPOCHS` row (epoch, `package.json`
version released, day on `main`), listed by the board's picker and checked by
the same test (last row = epoch in force, package version). Unpublished,
`RULES_EPOCH` is still 1, its comment listing what later epochs would have been:
read it first.

Check: `bun run sim --runs 300` before and after, same seed; decide the epoch
and write down why; `bun run check` (repin the fingerprint);
`bun test tests/rules.test.ts`, mostly `BALANCE`-derived but with hard-coded
values (two `ci` levels = exactly `+10`) to adjust if you moved the number.

## Save versioning

In `dto/version.ts` (storage keys aside):

| | Describes | Bumped | Old saves |
|---|---|---|---|
| `SAVE_VERSION` | a saved run's **shape** | by hand | must keep loading |
| `RULES_FINGERPRINT` | what rules **do** | derived | load, not ranked |
| `RULES_EPOCH` | rules **code** the hash cannot see | by hand | load, not ranked |

### `SAVE_VERSION`

Bump when a stored save would fail `RunSaveSchema.safeParse` (new required
field, rename, changed `PlayerAction`; not for optional or Zod-defaulted
fields). **Every bump gets a migration** in `dto/migrations.ts`, keyed by the
version migrated *from*, `n` to `n + 1`:

```ts
const MIGRATIONS: Record<number, (save: LooseSave) => LooseSave> = {
  1: (save) => ({ ...save, newField: defaultValue }),
};
```

`migrate()` walks the chain; a gap returns `No migration from save version n`
and refuses the save (browser: run cannot resume; server: submission rejected);
a *future* save is refused with a reload message. `replayRun`, the only caller,
casts the result unparsed (despite the file's comment): with the first real
migration, re-validate with `RunSaveSchema`. Versions 2 and 3 have no entry on
purpose: unpublished, the storage keys moved.

`STORAGE_KEYS` (`lib/storage/keys.ts`) suffixes each key (`devgame:run:v3`,
`devgame:meta:v1`…); bumping one orphans local saves instead of migrating them:
the blunt instrument, only if a migration is impossible.

### `RULES_FINGERPRINT` and `RULES_EPOCH`

`submitRun` checks `isCurrentRules(save)` and returns
`This run was played against older rules`; the player keeps run and local
score, off the board.

### What happens to a run already in the database

`Run.rulesEpoch`, the one-epoch filter and epoch-0 rows:
[database.md](database.md#runs-belong-to-a-rules-epoch). After a bump:

- Finished rows **leave the default board**, not deleted: still scored, in the
  player's history, ranked under their epoch in the picker.
- `in_progress` runs are untouched at rest, but the client's `resumeActions`
  loop (`bridge/session.ts`) stops at the first illegal action, keeping what
  replayed: a run across a rules change may come back truncated.

No backfill, ever: old scores describe a game that no longer exists.

Check: `bun test tests/dto.test.ts` (`migrate`: future refused, current passes;
`isCurrentRules`). After a `SAVE_VERSION` bump, `replayRun` a real old save in a
test: it must still score.

## Changing a DTO after adding a feature

The DTO is the trust boundary: outside `dto/`, what crosses it is hostile; this
order keeps it so.

- **No DTO may ever carry a score.** `submitRun` replays and writes the engine's
  number; `dto.test.ts` asserts `RunSaveSchema` strips a client `score`.
- **JSON columns are re-validated on read**: `Run.save`
  ([database.md](database.md#the-run-row-keeps-the-save-whole)), and
  `Profile.unlocks`/`settings` by `MetaProgressSchema` (`lib/profile/row.ts`).

1. **`dto/run.ts` or `meta.ts`**: the Zod field, bounded (string `.max()`,
   number `.min().max()`): the schema alone stands between a hostile client and
   the engine.
2. **`dto/version.ts`**: bump `SAVE_VERSION` if required.
3. **`dto/migrations.ts`**: its migration.
4. **`prisma/schema.prisma`**: a column only if a query needs it
   ([database.md](database.md#the-run-row-keeps-the-save-whole)), with its
   index ([database.md](database.md#indexes)).
5. **`bun run db:migrate`** (after `bun run db:up`). Review the SQL: a non-null
   column on a populated table needs a default, usually dropped right after (as
   `00000000000002_run_unique_fingerprint/migration.sql`).
6. **`lib/run/actions.ts`**: thread it through `saveRun`, `submitRun`; server
   actions are public, so re-check here, not only in the page.
7. **`lib/run/claims.ts`**: **check here any field that changes the map or
   rolls.** A replay is only as trustworthy as its start, and saves state their
   own `profileId`, `unlockedSkills`, `startingSkillPoints`:
   `anti-cheat.test.ts` shows 999 claimed starting points replay valid and score
   differently from the honest run. `overclaims` is one-sided: claiming **less**
   than the account is fine (last week's run predates this week's unlocks), more
   never.
8. **`dto/replay.ts`**: a field feeding `createRun` goes in its `meta`, or the
   server replays another game (`determinism.test.ts` compares `replayRun`'s
   hash with the live session's).
9. **`lib/storage/sync.ts`, `local.ts`**: `localStorage` reads use the same
   schema; unparsable values are deleted, not carried.
10. **`src/game/index.ts`**: export the type if needed outside `src/game` (the
    game's whole public surface).
11. **Tests**: `dto.test.ts` (good shape in, bad out), `claims.test.ts`
    (overclaims, off-by-one included), `determinism.test.ts` if replay changes.

Check: `bun run check`; a save without the field loads through `migrate`; an
overclaim is refused by `overclaims`; `replayRun` on a live session keeps its
`stats.hash`.

## Seeds and the daily

### How a seed becomes a game

`createRun` (`core/run.ts`) sets `rng: { s: fnv1a(seed) | 0 }`, a cursor **in
the run state** advanced in place by `createRng` (`core/rng.ts`): cloning the
state clones the stream. So `rng.chance()` draws even at 0 % and 100 %;
skipping would tie the stream to the odds (which depend on the build),
splitting two players on one seed. The save holds no board, snapshot or score;
one `Date.now()` or `Math.random()` in `core/` (`CLAUDE.md` boundary 8) makes
old runs unreplayable and silently breaks the leaderboard.

### The daily seed

`deriveDailySeed(dateIso, secret)` (`lib/daily/seed.ts`): HMAC-SHA256 of
`devgame-daily:YYYY-MM-DD` under `DAILY_SEED_SECRET`, 16 hex chars; `utcDate()`
starts days at midnight UTC. `getDailySeed()` (`lib/daily/store.ts`) memoises it
in `DailySeed`, so rotating the secret cannot silently change past boards.
**Never derived in the browser** (`CLAUDE.md` boundary 12): that ships the
secret, letting its holder practise tomorrow's map. `submitRun` rejects a daily
not on today's server seed (`The daily changed at midnight UTC`) and takes
`dailyDate` from the server clock, never the save's `createdAt`.

### Reproducing a player's run locally

`replayRun` is pure; the save suffices.

1. The save: `Run.save` (whole `RunSaveDto`), or `localStorage` key
   `devgame:run:v3`.
   ```sql
   SELECT save FROM "Run" WHERE "clientRunId" = '<uuid>';
   ```
2. Replay a JSON file:
   ```ts
   import { replayRun } from "@/game";
   const result = replayRun(JSON.parse(await Bun.file("run.json").text()));
   ```
3. `result.valid`: replays; `failedAt`: the illegal action's index;
   `result.stats.hash`: `hashState(state)`, all that decides what follows, minus
   the log (a translation cannot change it).
4. To watch, step `applyAction` (`rules/reducer.ts`) printing events, like
   `scripts/sim.ts --verbose`.

A real run that will not replay usually means a rules change: compare its
`rules` with `RULES_FINGERPRINT`.

## Adding or changing translated text

The engine emits `{ key, params }`, never display strings; React (`useGameText`,
`src/components/hud/useGameText.ts`) or the Pixi scene translates, so the server
replays without i18n.

1. Emit `text(key, params)` (`core/i18n.ts`), key a dot path in `game`.
2. **A parameter naming something is a key reference**: the engine knows ids,
   not names, so it passes `ref(...)`, resolved by `renderText()` before
   substitution. Mark it, never guess from the string:
   ```ts
   text("log.ticket_merged_skill", { skill: ref(`skills.${event.skillId}.name`) })
   ```
3. Both catalogues; FR is the source of truth, EN follows; ICU placeholder names
   match.

`messages.test.ts` checks identical key sets, no empty message, matching ICU
placeholders, non-breaking spaces before French double punctuation, tiered keys
over a base, every reachable commit subject and feature name, and these keys
from id arrays:

| Keys | For |
|---|---|
| `name`, `desc` | skills, relics, tree, upgrades, acquisitions, objectives, profiles; `game.nodes.<kind>` (kinds from `BALANCE.energy.cost`) |
| `title`, `log` | failure, merge, ambient events (`game.events.<id>`) |
| `name` | branches, ranks, ticket kinds |
| `name`, `bio` | competitors |
| `title`, `text`, `choices.<choice>` | narrative events |
| `aiName` | `DETOUR_KINDS` |
| `game.system.t3..t6.<note>` | the notes the test lists |

**Unchecked**: keys no table derives (all `game.log.*`, `game.notes.*`): a new
log line or preview note passes the suite and shows a raw `log.node_done.ai`.
Read `core/log.ts`, `rules/preview.ts` against the catalogues, or run
`/i18n-check`.

Check: `bun test tests/messages.test.ts`; `/play` in both locales, reading the
commit log.

## Database changes

`docs/database.md` is canonical for the schema, indexes, migrations and runs.
Pointers, plus what it does not say:

- The two partial unique indexes (what they guarantee, why Prisma never
  reproduces them, the check query, re-adding them after a squash):
  [database.md](database.md#two-partial-unique-indexes-are-hand-written).
  Losing `Run_one_in_progress` breaks resume for that player only, days later;
  for `Run_one_finished_per_fingerprint`, `submitRun`'s duplicate check covers
  the common case and the index the race.
- On a squash, the schema holds only comments pointing at those migrations:
  copy the `CREATE UNIQUE INDEX` statements with their comments into the
  squashed migration. `00000000000003_run_rules_epoch` also recreates two
  leaderboard indexes led by `rulesEpoch`; being in the schema, Prisma
  reproduces them.
- Schema indexes: [database.md](database.md#indexes). Better Auth tables:
  [database.md](database.md#better-auth-owns-four-tables). Generated client:
  [database.md](database.md#layout). `prisma migrate reset`
  ([database.md](database.md#migrations)) is also denied in
  `.claude/settings.json`: ask, never work around it.

The index check, locally:

```bash
docker exec devgame-postgres psql -U devgame -d devgame \
  -c "SELECT indexname FROM pg_indexes WHERE tablename = 'Run';"
```

## A routine release check

Cheapest first:

1. `bun run check` (typecheck, `biome check .`, `bun test`): nothing ships red.
2. `bun test tests/content.test.ts` alone after content or balance changes, to
   read the fingerprint failure.
3. `bun run sim --runs 300` if `src/game/` changed, read as above.
4. Decide `RULES_EPOCH` by the table and say why; if it moved, the bump steps.
5. `bun x prisma migrate status` on the reachable target database if the diff
   has migrations; the index check
   ([database.md](database.md#two-partial-unique-indexes-are-hand-written)) if
   migrations were touched.
6. `bun run build`: stricter than `dev`, where client/server boundary mistakes
   surface; it runs in the image with placeholder env values, as `env.ts`
   validates at import.
7. One run per locale: the suite renders nothing, so only a human sees a raw
   `log.something`, an unresolved HUD parameter, a graph taller than the window.
