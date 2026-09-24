# Maintenance

How to change this game without breaking the runs people already played.

`docs/game-design.md` says what the game is, `CLAUDE.md` says what the code may
not do, and this file says what to touch, in what order, and what goes wrong
when you skip a step. Most of the traps here are silent: the typecheck passes,
the tests pass, and the feature simply never appears.

Two facts explain nearly everything below.

- **A run is `seed + ordered actions`, and nothing else.** The server replays
  that list to decide what a score was. Anything that changes what the list
  replays to is not a tweak, it is a new game.
- **The engine is pure.** `src/game/core/` and `src/game/content/` have no
  clock, no `Math.random()`, no `@/lib`. Randomness is the cursor in
  `state.rng`, and the order of draws is part of the save.

## Adding a game element

Every content table lives in `src/game/content/`, is a frozen id array plus a
`Record` keyed by it, and is re-exported through `src/game/content/index.ts`.
The shape is always the same: add the id, add the entry, name it twice in the
message catalogues, then decide whether the epoch moves.

Three checks in `tests/content.test.ts` cover the table itself: ids are unique
within each list, every entry's `.id` matches its key, and **no entry mentions
an effect field that does not exist** (it compares `Object.keys(effects)`
against `EFFECT_KEYS`, which is derived from `NO_EFFECTS`). A fourth checks the
value's type matches the field's declared type. `tests/messages.test.ts`
derives the expected message keys from the same id arrays, so a missing
translation fails there and names the id.

### A skill

1. Add the id to `SKILL_IDS` in `src/game/content/skills.ts`. Every skill is
   the reward of a ticket you deliver; there is no other source.
2. Add the `SKILLS` entry: `effects`, `unlockCost`.
3. If no field in `Effects` expresses what it does, see
   [When no effect field fits](#when-no-effect-field-fits).
4. Add `game.skills.<id>.name` and `game.skills.<id>.desc` to **both**
   `messages/fr.json` and `messages/en.json`.
5. A skill reaches the board through `availableSkills()` in
   `src/game/core/rules/sprint.ts`: the account's unlocks, minus what the run
   already earned, minus what a ticket on the board already promises.
   `freeFeatureSkills()` derives the starter set from `unlockCost: 0`, and
   both `createRun` and `emptyMeta()` read it — one place, on purpose.
6. A skill with `unlockCost > 0` is unlocked by `applyRunToMeta` in
   `src/lib/profile/progression.ts` once the player has banked that many
   commits. No extra wiring.
7. Ticket generation: none. `drawTicket` in `src/game/core/map/tickets.ts`
   takes whatever pool it is handed.

**What to verify.** `bun test tests/content.test.ts tests/messages.test.ts`,
then `bun run sim --runs 200` and confirm no policy's score distribution moved
by more than noise. Then the epoch question below.

### A sprint bonus (a "relic", in the code)

1. Add the id to `RELIC_IDS` and the entry to `RELICS` in
   `src/game/content/relics.ts`, with `boost(...)` or `keep(...)`.
2. A **boost** is a `BoostEffect`, applied once by `applyBoost` in
   `src/game/core/rules/relics.ts` through the ordinary channels (energy,
   debt, quality, money, share, a dev, a ticket…). A new kind of effect is
   a new optional field there and a new branch in `applyBoost`. Something
   that must outlive the pick — a discount, a free hire, extra turns,
   boosted paydays — lives in `RunState.boosts` and is spent by the rule
   that honours it (`shop.ts`, `team.ts`, `reducer.ts`, `economy.ts`).
3. A boost gets a `when` condition so it is only offered when it would do
   something; the conditions are the `RelicCondition` union, evaluated by
   `holds` in `rules/relics.ts`. Thresholds go in `balance.relics`.
4. A **keep** is permanent `effects`, gathered every turn like a skill's.
   It must not duplicate something the shop or the tree sells: that is the
   reason to pick it over a boost.
5. Two message entries, `game.relics.<id>.name` and `.desc`, in both files.
6. **This always moves the epoch.** The offer is two `rng.shuffle`s over the
   eligible keeps and boosts; one more entry changes the shuffle, which
   changes the offer and every draw after it, for every run ever recorded.

**What to verify.** `bun test tests/relics.test.ts tests/content.test.ts
tests/messages.test.ts tests/sprint.test.ts`. The relics test asserts the
offer is `sprint.relicOffer` distinct cards with `relics.keepsPerOffer`
keeps, and that each boost does what its description says. Then the sim,
then the Balance page: `relicsOffered` and `relicsChosen` give each card's
pick rate, and a card nobody takes is a card to rewrite.

### A skill tree node

1. Add the id to `TREE_IDS` and the entry to `TREE` in
   `src/game/content/tree.ts`, with its `branch` (one of `TREE_BRANCHES`).
2. `cost` is indexed from level 0 and **its length must equal `maxLevel`**;
   every price must be positive. `tests/content.test.ts` checks both, and that
   `treeCost(id, maxLevel)` is `undefined`.
3. `perLevel` is the effect of *one* level. Levels stack by summing, so a
   boolean field cannot be levelled meaningfully — that is why `review_bot`
   adds `freeReviewEvery: 1` per level and `freeReviewCadence()` in
   `rules/modifiers.ts` turns the sum into a cadence.
4. `requires` names the nodes that must be at a given level first. They must
   be on the **same branch** (the tree screen draws the connector under the
   parent) and must not form a cycle — `tests/content.test.ts` checks both.
   `canPlaceTree` in `rules/tree.ts` refuses a locked node, so it is never
   offered; the preview says which prerequisite is missing.
5. Two message entries under `game.tree.<id>`. A new branch needs
   `game.branches.<id>.name` and a column in `SkillTreeDialog.tsx`.
6. No action wiring: `getAvailableActions` and `gatherEffects` both iterate
   `TREE_IDS`, and `PlayerActionSchema` validates against `z.enum(TREE_IDS)`.
7. A tree id draws no randomness, so adding one at the **end** of the array
   does not change what an old log replays to — but it does change
   `RULES_FINGERPRINT` and the shape of `state.tree`, so the pinned hash in
   `tests/content.test.ts` must be updated.

Points come from three places: `BALANCE.tree.perSprint` at every sprint end,
`accountSkillPoints(level)` (`src/game/core/score.ts`) at the start of every
run, and the shop's `buy_point`. The starting points are declared by the save
(`startingSkillPoints`) and checked by `overclaims` against `meta.level`.

**What to verify.** `bun test tests/content.test.ts tests/messages.test.ts
tests/actions.test.ts tests/rules.test.ts`.

### An upgrade

1. Add the id to `UPGRADE_IDS` and the entry to `UPGRADES` in
   `src/game/content/upgrades.ts`: `category`, `tier` (the lowest tier that
   shows it), `price` as `{ base, growth }` (level *n* costs
   `round(base × growth^n)`), `maxLevel` (leave it out for a rung that never
   ends), `upkeep` (charged per level every month, 0 for a one-off),
   `perLevel`, and `hires` for a site that brings a team. Keep an infra rung at
   the ladder's price per user — `tests/content.test.ts` checks that each rung
   is a tier above the last and ten times as big.
2. If no `Effects` field expresses what it does, see
   [When no effect field fits](#when-no-effect-field-fits). The economy reads
   `infraCapacity`, `infraCapacityPct` and `mrrBonusPct` in
   `rules/economy.ts`, the team reads `teamSeats`, `devSpeedBonus`,
   `devCapacityBonus` and `hiringDiscountPct` in `rules/team.ts`, and the HUD
   reads `autopilot` as a level.
3. Two message entries under `game.upgrades.<id>`. The shop lists every id of
   a category through `upgradesIn` and shows one greyed rung of the next tier,
   so nothing to add in `CompanyDialog.tsx`; `org` is listed under Sites in
   the Team tab.
4. No action wiring: `getAvailableActions` offers `buy` for every id the tier
   has unlocked and the money can pay for, `buyUpgrade` in `rules/shop.ts`
   refreshes the effects and the energy ceiling, and walks in the team a site
   brings through `addDev`.
5. Draws no randomness. The fingerprint moves (`UPGRADE_IDS` is hashed), so
   repin it.

**What to verify.** `bun test tests/content.test.ts tests/messages.test.ts
tests/economy.test.ts`, then `bun run sim --runs 200` and read the `money`
line: `upgrades avg` says whether the manager ever buys it.

### A developer's name and colour

A hire's first name comes from `DEV_NAMES` (`src/game/content/team.ts`),
hashed from the seed and the dev id in `nameFor` (`rules/team.ts`) — never
drawn, so hiring still takes nothing from the PRNG, which `tests/team.test.ts`
asserts. The colour is `devColourIndex(id)`: the serial modulo
`DEV_COLOUR_COUNT`, the player being index 0. The eight colours live twice,
in `DEV_COLOURS` (`render/theme.ts`) for the canvas and as `--color-dev-<n>`
in `globals.css` for the HUD, and `tests/theme.test.ts` compares the two.
Adding a name is appending to the array; changing the count means changing
both lists and the constant together.

### A developer rank

Ranks live in `DEV_RANK` in `src/game/content/team.ts`: `capacity`,
`speed` (points filled per turn), `hireCost`, `salary`, `tier` (the lowest
tier that can hire it). Adding one means appending it to `DEV_RANKS` (the
order is the promotion ladder, `nextRank` walks it), a `game.ranks.<id>.name`
message, and a repinned fingerprint. `hire` is offered for every rank the
tier, the seats (`maxSeats`: the head office plus every site) and the money
allow; the rest of the team's rules read the rank through the table. Every
way a developer joins — hiring, a site, an acquisition — goes through
`addDev`, so the roster has one door.

What a developer does each turn — pick up, write, land — is `workTeam` in
`rules/team.ts`, and it is deliberately a pure function of the board: no roll,
no debt, no energy. Changing that is a rule change, and `tests/team.test.ts`
is where the promises are written down.

### A sound

`sfxFor` in `src/game/audio/sfx.ts` is an exhaustive switch over every event
type: adding an event means choosing its sound or `null` there, or nothing
compiles. A new sound is an id in `SFX_IDS`, a `null` in `SFX_FILES`
(`manifest.ts`) until there is a file, and a case in `sfxFor`. The
storyboard places the `sfx` step after the event's effect by itself;
`tests/audio.test.ts` checks one step per mapped event and none before its
own node's reveal. The engine never imports anything under `audio/`.

### A word that changes with the tier

A HUD label the tier rewrites is a key under `hud.tiered.t<n>` with the same
name as the base key; `useTiered(tier)` reads the highest tier at or below
the run's that defines it, and the base key otherwise.
`tests/messages.test.ts` refuses a tiered key without a base. A new line of
the system's is a `SystemNote` in `types.ts`, four strings under
`game.system.t3..t6.<note>` in both catalogues, and a `systemNote(context,
note)` call from the rule that knows — it emits nothing below the third tier.

### A sprint objective

Objectives live in `OBJECTIVES` in `src/game/content/objectives.ts`: weight,
tier, what it requires on the board, its reward, and what missing it costs.
Adding one means a target in `targetOf`, a progress and a criterion in
`objectiveProgress`/`objectiveMet` (`rules/objectives.ts`), a
`game.objectives.<id>.{name,desc}`, a `hud.objectiveProgress.<id>` line, and
a repinned fingerprint. A new counter belongs in `SprintCounters`, reset in
`drawObjective`, incremented in the rule that knows — never in the HUD.

### A narrative event

Events live in `NARRATIVE_EVENTS` in `src/game/content/narrative.ts`:
source, trigger, weight, tier window, `minSprint` (never below 2), `once`,
what it needs, and exactly two choices with their effects. Adding one means
`game.narrative.<id>.{title,text,choices.<choice>}` in both catalogues, in
the voice of `docs/lore.md`, and a repinned fingerprint. A new *effect*
field is a branch in `answerEvent` (`rules/narrative.ts`) and a note in the
preview. `maybeNarrative` draws twice on every trigger whatever happens; do
not add a draw that only happens when an event opens, or a run that saw no
event stops replaying — `tests/narrative.test.ts` checks that too.

### A ticket kind

Kinds live in `TICKET_KIND` in `src/game/content/tickets.ts`: colour, ref
prefix, whether the team takes it, whether it counts as work in progress,
whether it earns and weighs, whether it may carry a skill, a `mustWrite`, a
deadline in sprints, whether the board may force it when stale, and whether
a commit on it may turn an obstacle up (`spawnsObstacles`). Adding
one means a weight in `BALANCE.tickets.kinds.weights` (or an arrival of its
own, like the debt ticket's), a size in `drawTicket`, its reward in
`rewardKind` (`rules/write.ts`), a `game.tickets.<id>.name`, a
`hud.kindHint.<id>`, a `log.ticket_assigned.<id>`, and a repinned
fingerprint. The first ticket of a sprint stays a feature: the landing
demo and `tests/tickets.test.ts` count on it.

**The obstacle** is the one kind never drawn from the board. `maybeSpawnObstacle`
(`rules/tickets.ts`) rolls it after a plain or risky commit, yours
(`writeCommit`) or the team's (`writeTeamCommit`); `spawnObstacle` births it
open, forked off its parent, with `parentId` set. Everything that reads a
ticket's commits for a review — `unreadAiOn`, `buggedOn`, `mostIndebtedOn`,
what ships — goes through `treeNodeIds`, the ticket and its obstacles
together, so an obstacle's bugs are its feature's. `isReady` refuses a
ticket with an open obstacle, `getAvailableActions` offers `merge` instead
of `submit` on a ready obstacle, and `completeObstacle` (`rules/write.ts`)
writes the `obstacle_merge` node in the *parent's* column and pushes it onto
the parent's chain. `checkInvariants` knows all of this; `tests/obstacles.test.ts`
plays it. A new place that reads a ticket's commits must ask itself whether
it means the tree.

### A competitor

Competitors live in `COMPETITORS` in `src/game/content/competitors.ts`:
`baseStrength` (scaled by the tier it enters at), `aggression` (percent
growth a month), `entersAtTier`. Adding one means a `game.competitors.<id>`
name and bio in the voice of `docs/lore.md`, and a repinned fingerprint. The
market's rules are `rules/market.ts`; the monthly drift draws once for
**every** competitor and once for the merger, whoever is standing, so the
count of draws never depends on the board — `tests/market.test.ts` replays
a run to check.

### The pull request review

There are no acceptance criteria: a ticket with its points full is submitted,
and `performSubmit` in `src/game/core/rules/acceptance.ts` decides. What it
weighs is in `BALANCE.acceptance` — the chance each unread machine-written
commit is caught (`bugDetectPct`), the debt ceiling (`maxDebt`), the fix
points a bug adds (`pointsPerBug`). A new reason to refuse is a rule change
there, a new field on the `pr_reviewed` event so the dialog can read it out,
and a line in `ReviewDialog.tsx`.

A rejection always opens one more ticket beside the rejected one
(`arriveTicket` + `openTicket`, forced). That is the design's pressure, not a
side effect: removing it makes a rejection cheap.

**What to verify.** `bun test tests/acceptance.test.ts`, then `bun run sim
--runs 200`: `tickets delivered` against `carried over` per policy, and `wip`
— a rejection spiral shows as a WIP that climbs past three.

### An event

The three tables in `src/game/content/events.ts` behave differently.

**A failure event** (drawn when a commit roll misses):

1. Add the id to `FAILURE_EVENT_IDS` and the entry to `FAILURE_EVENTS`:
   `weight`, `requiresUnreviewedAi`, `forbiddenOnHotfix`.
2. Add a `case` to the switch in `resolveFailure` in
   `src/game/core/rules/events.ts`. The switch is exhaustive over the id union,
   so **this one is a typecheck error until you write it** — the only content
   addition the compiler catches for you.
3. Return the right `FailureOutcome`: `conflict` hands the player a second
   decision, `resolve` writes the commit anyway, `retry` eats the turn and
   writes nothing, `resolve_then_incident` writes it and records a production
   incident, which opens a hotfix ticket.
4. Two message entries: `game.events.<id>.title` and `.log` (**not** `name`/
   `desc` — events are the exception).

**A merge event** (drawn when a ticket lands and `mergeEventChance` said
something happens):

1. Add the id to `MERGE_EVENT_IDS` and the entry to `MERGE_EVENTS`: `weight`,
   `outcome` (`conflict` opens the resolution choice, `resolve` lands the
   ticket), `effect`, `noRegen`, `cancelledByDependabot`.
2. Its whole effect is the table: `drawMergeEvent` in `rules/events.ts` applies
   `effect.energy` and `effect.debt`, and `performMerge` in `rules/commit.ts`
   reads `outcome` and `noRegen`. A new kind of consequence means editing one
   of those two, which is a rule change.
3. Same two message entries, `title` and `log`.

**An ambient event** (drawn now and then after a successful commit):

1. Add the id to `AMBIENT_EVENT_IDS` and the entry to `AMBIENT_EVENTS`.
2. Its whole effect is the table: `effect.energy` and `effect.debt`, applied
   by `drawAmbient`. A third kind of effect means editing `drawAmbient`, which
   is a rule change.
3. `cancelledByDependabot` removes it from the table entirely when the player
   has the DevOps node.
4. Same two message entries, `title` and `log`.

All three tables feed `rng.weighted`, so **adding to any of them always moves
the epoch**: the weights change, the draw changes, every recorded run replays
differently.

**What to verify.** `bun test tests/events.test.ts tests/content.test.ts
tests/messages.test.ts`, then `bun run sim --runs 300` and read the `failures`
line: an event that never appears in three hundred runs has a weight problem or
an eligibility flag that is never satisfied. Merge events are counted by
`tests/events.test.ts` over three hundred seeds rather than by the sim.

### A way of writing a commit (a "detour")

Refactor, fix, risky, squash, docs and rebase are not nodes. They are kinds a
commit *becomes* when the player chooses to write it that way, so adding one is
a weight and a rule, not a place on the map.

1. Add it to `DetourKind` in `src/game/core/types.ts`. It is a subset of
   `NodeKind`, so add it there too — and to `DetourKindSchema` in
   `src/game/dto/run.ts`, or a save that took it will not parse.
2. Say when it is offered: `offersOf` in `src/game/core/rules/tickets.ts` is
   the **one** source of truth the actions, the previews and the commit rule
   all read. Always, or under a condition the way `squash`, `rebase`, `fix`
   and `refactor` are — a detour with a target on the ticket in hand is one
   the player can read; a detour offered at random is one they ignore.
3. Add an energy price to `BALANCE.energy.cost` — a typecheck error until you
   do — and a glyph to `nodeGlyph` in `src/game/render/theme.ts`, likewise.
   `pointsFor` in `rules/write.ts` decides what it fills: a rebase fills
   nothing.
4. Teach the rules what it does, in `writeCommit` (`src/game/core/rules/write.ts`)
   or in `rules/commit.ts` (`succeed`, for something that happens on a landed
   roll). Both read the kind `commitKindFor` resolved from the action.
5. Two message entries under `game.nodes.<kind>`. The panel labels the card
   `<name> · à la main` / `· par l'IA` from them.
6. It is offered on every commit rather than drawn, so on its own it moves no
   RNG — but the rule that makes it do something almost always does. Decide
   the epoch on that.

**What to verify.** `bun test tests/rules.test.ts`, then `bun run sim --runs
200` and confirm the policies still take it — a detour nobody writes is a
button that does nothing.

### A node kind

Rare now: almost everything is either a commit on a ticket or a merge. This
is the one with the most places to touch and the least help from the compiler.

1. Add it to the `NodeKind` union in `src/game/core/types.ts`.
2. Add an energy price to `BALANCE.energy.cost` in
   `src/game/core/balance.ts`. That record is `satisfies Record<NodeKind,
   number>`, so a missing entry is a typecheck error. It is also the list
   `tests/messages.test.ts` enumerates node kinds from, so nothing will ask you
   for the translation until this exists.
3. Add a glyph to `nodeGlyph` in `src/game/render/theme.ts` — exhaustive
   switch, so this is a typecheck error too. Check `laneColour` in the same
   file; it is *not* exhaustive and will fall through to the feature colour.
4. Write it. Nothing is generated ahead of the player: a node exists because
   a rule in `src/game/core/rules/write.ts` wrote it — `writeCommit` for the
   ticket's commits, `completeMerge`, `writeSprintStart` and `writeRelease` for
   the trunk. `checkInvariants` (`src/game/core/map/graph.ts`) says what may
   sit on `main` and `dev`; a new trunk kind has to be added there or the
   tests will refuse it.
5. Teach the rules what it does, in `writeCommit`: it special-cases `risky`,
   `refactor`, `fix`, `squash`, `docs` and `rebase`. **A new kind falls
   through silently** and behaves like an ordinary commit — no typecheck
   error, no test failure.
6. Three message entries under `game.nodes.<kind>`: `name`, `desc` and
   `aiName`, the card's label when the machine writes it ("Rebase IA"). The
   log renders `nodes.<kind>.name` as a parameter of `log.node_done`;
   `tests/messages.test.ts` checks `aiName` for every `DETOUR_KINDS` entry.
7. It changes what a rule writes, so **it moves the epoch**.

**What to verify.** `bun test tests/map.test.ts` — it plays 500 seeds and runs
`checkInvariants` on each, and will catch a parent that does not exist, a row
that does not increase, two commits on one spot, work outside a ticket's
column, an open ticket holding a column before its first commit (or writing
without one), a ticket's nodes outside its column, or a cancelled ticket that
kept anything. Then `bun run sim` and read the `generation` block: `invariant
failures 0`.

**A rule that spends production's patience** goes through `raiseQuality` in
`src/game/core/rules/quality.ts` with a `QualitySource`, never by writing
`state.quality`. The source is what the log line, the canvas pop and the
run-over screen are made of, and `RunStats` counts the occurrence in the same
rule — counters increment in rules, never in the HUD. A new source means a
new member of `QualitySource`, a `log.quality.<source>` line, a
`play.firedBy.<source>` and a `play.qualitySource.<source>` label in both
catalogues.

**A supervisor level** is a branch in `chooseSupervisor`
(`src/game/bridge/supervisor.ts`), a reason in `SUPERVISOR_REASONS` with its
`hud.supervisorMove.<reason>` line, and a level in `UPGRADES.ai_supervisor`.
Level 1 must stay `chooseAutopilot` exactly: `tests/autopilot.test.ts`
checks the two agree. The landing page's demo (`src/game/bridge/demo.ts`)
plays the third level on today's seed, so a change to any level changes the
homepage. It is a **showcase** run (`showcase` in `CreateRunOptions`): two
juniors on the roster from turn 1 who are never promoted (`promote`), a
board topped up to `backlog` waiting tickets at every sprint
(`arriveTickets`) that never forces a stale one on you (`assignStaleTickets`), a team that spreads
its speed a point per held ticket so its columns live side by side
(`workTeam`), and a run that cannot be stopped — `gameOver` and
`releaseDev` are no-ops, `performSubmit` accepts every pull request,
`mergeEventChance` is zero, `performCommit` rolls at 100 and `isReady`
ignores a flagged bug — and, since it never ends, it forgets: after every
action `forgetOldHistory` (`rules/history.ts`) drops the commits more than
`SHOWCASE_KEEP_ROWS` rows behind the head and the merged tickets they
belonged to, keeping the trunks' tips, what the release has yet to judge
and every open ticket's commits. Those twelve reads of `state.showcase` are
the whole of it; a showcase is never saved, replayed or scored. `tests/demo.test.ts`
plays it on thirty seeds and checks that it cannot end, keeps its team and
keeps the team busy.

**A hack kind** is a branch in `hackOffer` and `performHack`
(`src/game/core/rules/hack.ts`), a `HackKind`, its `hud.hack.<kind>`,
`notes.hack_win.<kind>`, `notes.hack_lose.<kind>` and `log.hack.<kind>.*`
lines. The offer must stay rare — `tests/hack.test.ts` asserts an ordinary
turn offers nothing — and the coin is the only draw, taken only when the
player tries.

**A phase the idle clock can be in** needs a branch in `idleTarget`
(`src/game/bridge/idle.ts`): the clock presses that move, and the bar shows
under the button that plays it. A phase it cannot answer is a run that stalls
when left alone; `tests/autopilot.test.ts` plays every phase.

### A starter profile

1. Add the id to `PROFILE_IDS` and the entry to `PROFILES` in
   `src/game/content/profiles.ts`.
2. `unlockCost` **must be greater than zero** for anything but `junior` —
   `tests/content.test.ts` asserts it.
3. `startingSkills` are `SkillId`s granted at `createRun`;
   `startingDevops` is a partial map of levels.
4. Two message entries under `game.profiles.<id>`.
5. No UI wiring: `RunSetup.tsx` renders `PROFILE_IDS`, `RunSaveSchema`
   validates `z.enum(PROFILE_IDS)`, and `applyRunToMeta` unlocks by banked
   commits.
6. `overclaims` in `src/lib/run/claims.ts` already refuses a save naming a
   profile the account has not unlocked — nothing to add there.
7. A profile id draws no randomness, so old logs replay unchanged. The
   fingerprint still moves.

**What to verify.** `bun test tests/content.test.ts tests/messages.test.ts
tests/claims.test.ts`, then `bun run sim --runs 200` — the simulator only plays
`junior`, so a new starter needs a hand-played sanity check as well.

### When no effect field fits

`Effects` in `src/game/content/effects.ts` is a flat additive record on
purpose: composition is a sum and a logical OR, which cannot be got wrong.

1. Add the field to the `Effects` interface **and** to `NO_EFFECTS`.
   `EFFECT_KEYS` is `Object.keys(NO_EFFECTS)`, and `addEffects` iterates
   `EFFECT_KEYS` — a field in the interface but not in `NO_EFFECTS` is silently
   ignored when summing. (`tests/content.test.ts` does catch this, because the
   content entry then names a key `EFFECT_KEYS` lacks.)
2. Read it somewhere. `rules/modifiers.ts` is the intended home for anything
   that changes a number; `rules/events.ts` and `rules/write.ts` read the
   switch-like ones.
3. **Nothing in the suite catches a field that is declared, summed and never
   read.** The relic simply does nothing. Write the test that proves it works,
   next to the others in `tests/rules.test.ts`.
4. Positive is always better for the player, and point fields are added to a
   chance expressed in percent. Keeping that convention is what lets
   `gatherEffects` be a blind sum.

## Changing a rule or a balance number

They are not the same change and they do not have the same consequences.

- A **balance number** is a value in `src/game/core/balance.ts`. Changing one
  moves `RULES_FINGERPRINT` automatically, because the fingerprint hashes the
  whole table.
- A **rule** is code in `src/game/core/rules/` or `src/game/core/map/`.
  Changing one moves nothing automatically. The fingerprint cannot see it.

### Why every number lives in one file

Not tidiness. Two reasons that matter operationally:

- The fingerprint hashes `BALANCE`. A number that lives inside a rule is a
  number that can change without any run being marked incomparable, which puts
  two different games on the same leaderboard.
- `bun run sim` is the only way to find out whether a number is wrong before a
  human plays fifty runs, and it can only tell you that if the number is
  reachable from one place.

**A literal like `0.7` inside a rule is a bug**, even a correct one. If you
need a new knob, add it to `BALANCE` under the section it belongs to, with a
comment saying what it is in game terms.

### Re-measuring with the simulator

`bun run sim` plays headless runs with fixed policies (`scripts/sim.ts`):

```bash
bun run sim                        # 200 runs, all four policies
bun run sim --runs 500             # more runs, tighter quantiles
bun run sim --policy careful       # one policy: ai | craft | mixed | careful
bun run sim --seed 42              # move the seed window
bun run sim --seed 42 --verbose    # one run, printed turn by turn
```

`--verbose` prints a single run and ignores `--runs`; with `--policy all` it
uses `mixed`. Without `--verbose` it first plays `min(500, runs * 2)` seeds for
forty actions each and checks the graph they wrote, then reports each policy.

The policies themselves live in `scripts/lib/policy.ts`, shared with
`bun run fixtures`, which plays the runs the local database is seeded with.
A change to a policy moves both: the sim's tables, and the scores on a
freshly loaded local board. The fixtures also carry a fifth hand,
`chooseQuit`, that ends a run in burnout on purpose — the patient policies
never lose under the current numbers, and a board needs finished runs.

**Reading the output honestly.**

- `generation → invariant failures` must be `0`. Anything else is a broken
  graph, not a balance problem, and `bun test tests/map.test.ts` will name it.
- `ends` should contain **no `stuck` and no `capped`**, and both `burnout`
  and `fired`. `stuck` means the engine reached a state with no legal action,
  or a free action changed nothing — always a bug. `capped` means a run hit
  the turn ceiling — a run that cannot end.
- `turns med` with `p10` and `p90` tells you the spread. A `p90` an order of
  magnitude above the median means the distribution is bimodal: most runs die
  early and a few go forever. The median alone will lie to you about that.
- `tickets delivered`, `carried over` and `forced` say whether the backlog is
  doing its job: a run that carries over more than it delivers is drowning,
  one that is never assigned anything is not being pushed. `wip` is the
  average number of extra open tickets per turn — the pressure the design asks
  for, and the thing that burns a run out if it climbs unchecked.
- `incidents` against `ends → fired`: the machine-written policies should be
  the ones production fires, the careful ones the ones that burn out.
- `score med` against `max`: one enormous `max` is one lucky run, not a
  balanced policy. Compare medians across policies.
- **No policy should dominate.** If `craft` doubles everything else's median,
  AI commits are not worth their points. The naive `ai` policy never reviews
  and never squashes, so it is meant to die fast; `mixed` and `careful` are
  the ones to compare.
- `failures` is a raw count across all runs. A failure id missing from the line
  entirely is one that can never fire: check its `requiresUnreviewedAi` and
  `forbiddenOnHotfix` flags.
- The simulator plays `junior` only, taking the first sprint bonus on offer, with no
  account unlocks. It cannot tell you anything about the other starters.

Run the **same seed and run count** before and after a change, and quote both.
A different `--seed` is a different sample.

### Reading real runs before touching a number

The simulator plays four policies nobody plays. Once the site is online,
the game sends every run home — at its end, every ten sprints, and when
it is abandoned — and the server replays each one and keeps a
`RunSummary` (`src/game/core/summary.ts`) in `RunSample`. The admin
panel's **Balance** page aggregates them by rules fingerprint: where runs
end and why, how far the abandoned ones got, which upgrades and tree
nodes get bought, which answer each event gets, the objectives' success
rate, how many tickets of each kind the player delivers against how many
arrive, the idle clock's usage.

The same page offers the digest as Markdown, in a textarea to copy and
as a download, with `BALANCE` quoted whole at the end. That document is
built to be handed to a model: paste it, ask which constant to move and
in which direction, then confirm the change with the simulator on the
same seed before and after.

Three things to know when reading it:

- A run counts once, at its last known sample; a checkpoint of a run that
  later ends is superseded by the final.
- Only runs played against the **current** fingerprint say anything about
  the current rules. The filter defaults to it; "all fingerprints" is for
  comparing before and after.
- A new counter belongs in `RunStats` (`src/game/core/types.ts`),
  incremented **in the rule** that does the thing, and read into
  `summariseRun`. The digest and its tests (`tests/telemetry.test.ts`)
  pick it up from there.

### The `RULES_EPOCH` decision

`RULES_FINGERPRINT` in `src/game/dto/version.ts` hashes the balance table, the
content id lists, and `RULES_EPOCH`. It moves on its own for a number or an id.
**It cannot see a change to the rules code** — fixing how a branch merges
alters every replay without touching a single number.

So, by hand:

> If the change makes an old action log replay to a **different game**, bump
> `RULES_EPOCH`.

In practice:

| Change | Epoch |
|---|---|
| A balance number | Yes — the numbers are the game |
| A sprint bonus, a failure event, a merge event, an ambient event | Yes — they enter an RNG pool |
| A node kind, or anything in `map/tickets.ts` | Yes |
| A rule that changes an outcome, a cost or a draw | Yes |
| A skill with `unlockCost > 0` | No — old saves carry their own `unlockedSkills` and never see it |
| A skill with `unlockCost: 0` | Yes — it joins the free pool, so it enters `rng.pick` on every map |
| Gating an action in `getAvailableActions` | Yes — an old log that took it no longer replays |
| A new `DetourKind` | Not on its own — it is offered, not drawn — but its rule is |
| A field added to `PlayerAction` | No on its own, but the rule reading it almost always is |
| A tree node, an upgrade, a rank or a profile id appended to its array | No — no randomness is drawn from any of them |
| Renaming a message, a comment, a variable | No |

When in doubt, bump it. The cost of bumping is a leaderboard that starts again.
The cost of not bumping is a leaderboard that compares two different games and
looks perfectly healthy while doing it.

Bumping the epoch changes the fingerprint, so the pinned value in
`tests/content.test.ts` (`expect(RULES_FINGERPRINT).toBe("…")`) has to
be updated in the same commit. Add a numbered line to the `RULES_EPOCH` doc
comment saying what changed — that list is the only record of why the boards
were reset — and a row to `RULES_EPOCHS`: the epoch, the `package.json`
version being released, and the day it lands on `main`. The board's picker
lists the boards by that row, and the same test checks the last row is the
epoch in force and carries the package's version.

**What to verify.**

1. `bun run sim --runs 300` before the change, saved.
2. Make the change. Numbers go in `balance.ts`; rules go in `rules/`.
3. `bun run sim --runs 300` with the same seed, and compare the tables above.
4. Decide on `RULES_EPOCH` and write down why.
5. `bun run check`. `tests/content.test.ts` will fail on the pinned
   fingerprint; update the literal.
6. `bun test tests/rules.test.ts` — it derives most of its expectations from
   `BALANCE`, but a few are hard-coded (a `ci` level being worth exactly `+10`,
   for instance) and will need adjusting if you moved the underlying number.

## Save versioning

Three different numbers, all in `src/game/dto/version.ts` except the storage
keys. They answer different questions.

| | What it describes | Bumped | Old saves |
|---|---|---|---|
| `SAVE_VERSION` | The **shape** of a saved run | By hand | Must keep loading |
| `RULES_FINGERPRINT` | What the rules **do** | Derived | Load, do not rank |
| `RULES_EPOCH` | Rules **code** changes the hash cannot see | By hand | Load, do not rank |

### `SAVE_VERSION`

Bump it when the *shape* of `RunSaveDto` changes in a way an old save does not
satisfy: a new required field, a renamed field, a changed `PlayerAction`.

**Every bump gets a migration** in `src/game/dto/migrations.ts`. The map is
keyed by the version being migrated *from*, and each entry turns `n` into
`n + 1`:

```ts
const MIGRATIONS: Record<number, (save: LooseSave) => LooseSave> = {
  1: (save) => ({ ...save, newField: defaultValue }),
};
```

`migrate()` walks the chain and the caller re-validates the result with
`RunSaveSchema`. A missing entry returns `No migration from save version n` and
the save is refused — in the browser that is a run the player cannot resume; on
the server it is a submission that is rejected.

A save from the *future* is refused rather than guessed at, with a message
telling the player to reload.

A purely additive optional field does not need a bump. A field with a Zod
default does not need a bump. Anything that would make an existing stored save
fail `RunSaveSchema.safeParse` does.

`STORAGE_KEYS` in `src/lib/storage/keys.ts` carries its own `:v1` suffix. That
is the blunt instrument: bumping a suffix orphans every local save instead of
migrating it. Use it only when a migration is genuinely impossible.

### `RULES_FINGERPRINT` and `RULES_EPOCH`

These do not stop a save loading. `submitRun` checks `isCurrentRules(save)` and
returns `This run was played against older rules` — the player keeps their run
and their local score, it just does not go on a board.

### What happens to a run already in the database

`Run.rulesEpoch` records the epoch a submission was played under, written from
`RULES_EPOCH` at submit time. Every leaderboard query in
`src/lib/leaderboard/queries.ts` filters on one epoch: the one in force by
default, or the one the board's picker selects from `RULES_EPOCHS`.

So when you bump the epoch:

- Every finished row keeps its old value and **leaves the default board**.
  Nothing is deleted; the rows are still there, still scored, still visible in
  a player's own history, and still ranked under their own epoch in the
  picker.
- Rows written before the column existed carry `0` and are already invisible.
  That is correct: nobody knows what rules they were played under.
- Runs still `in_progress` are unaffected at rest, but the client's
  `resumeActions` loop in `src/game/bridge/session.ts` stops at the first
  action that is no longer legal and keeps what replayed cleanly. A player
  mid-run across a rules change may find their run truncated.

There is no backfill and there should not be one. An epoch bump means the old
scores describe a game that no longer exists.

**What to verify.** `bun test tests/dto.test.ts` covers `migrate` in both
directions and `isCurrentRules`. After a `SAVE_VERSION` bump, load a real old
save: paste one into a test, run it through `replayRun`, confirm it still
scores.

## Changing a DTO after adding a feature

The DTO is the trust boundary. Everything outside `src/game/dto/` treats what
comes across it as hostile, and the order below is the order in which that
stays true.

Two rules that are not negotiable:

- **No DTO may ever carry a score.** `submitRun` replays the log and writes
  what the engine computed. `tests/dto.test.ts` asserts that a client-supplied
  `score` is stripped by `RunSaveSchema`.
- **Anything read back out of a JSON column is re-validated.** `Run.save` goes
  through `RunSaveSchema`, `Profile.unlocks`/`settings` go through
  `MetaProgressSchema` in `src/lib/profile/row.ts`. A row written by an older
  build is untrusted input like any other.

The order:

1. **`src/game/dto/run.ts` or `meta.ts`** — add the field to the Zod schema.
   Give it a bound: a string gets `.max()`, a number gets `.min().max()`. The
   schema is the only thing standing between a hostile client and the engine.
2. **`src/game/dto/version.ts`** — bump `SAVE_VERSION` if the field is
   required.
3. **`src/game/dto/migrations.ts`** — add the migration for that bump. Old
   saves must keep loading.
4. **`prisma/schema.prisma`** — only if the field needs its own column.
   Anything that is only ever read as part of the whole save stays inside the
   `save` JSON. Add a column when a query needs to filter or sort on it, and
   remember the index (see [Database changes](#database-changes)).
5. **`bun run db:migrate`** — needs the database up (`bun run db:up`). Review
   the generated SQL before committing it; a new non-null column on a populated
   table needs a default, and the default should usually be dropped
   immediately afterwards, the way
   `00000000000002_run_unique_fingerprint/migration.sql` does.
6. **`src/lib/run/actions.ts`** — thread the field into `saveRun` and
   `submitRun`. Server actions are public endpoints; re-do every check here,
   never in the page that renders the button.
7. **`src/lib/run/claims.ts`** — **if the field changes the map or the rolls,
   it must be checked here.** `overclaims` exists because the replay is only as
   trustworthy as the conditions it starts from: a save states its own
   `profileId`, `unlockedSkills` and `statPoints`, and
   `tests/anti-cheat.test.ts` demonstrates that a save claiming 999 in every
   stat replays as perfectly valid and scores more than twice as high. The rule
   is one-sided: a save may claim **less** than the account has (a run recorded
   last week predates this week's unlocks), never more.
8. **`src/game/dto/replay.ts`** — if the field feeds `createRun`, add it to the
   `meta` object there, or the server replays a different game from the one the
   player played. `tests/determinism.test.ts` compares `replayRun`'s hash
   against the live session's and will catch it.
9. **`src/lib/storage/sync.ts` and `local.ts`** — the client side. Everything
   read out of `localStorage` goes through the same schema; a value that does
   not parse is deleted rather than carried forward.
10. **`src/game/index.ts`** — export the type if anything outside `src/game`
    needs it. That barrel is the game's entire public surface.
11. **Tests** — `tests/dto.test.ts` for the schema (accept the good shape,
    reject the bad one), `tests/claims.test.ts` for the overclaim check
    including the off-by-one, `tests/determinism.test.ts` if it affects replay.

**What to verify.** `bun run check`, then specifically: a save missing the new
field still loads through `migrate`, a save claiming more than the account has
is refused by `overclaims`, and `replayRun` on a live session still produces
the same `stats.hash`.

## Seeds and the daily

### How a seed becomes a game

`createRun` in `src/game/core/run.ts` does one thing with the seed:

```ts
rng: { s: fnv1a(seed) | 0 }
```

That cursor lives **in the run state**. `createRng` in
`src/game/core/rng.ts` returns a handle that advances it in place, so cloning
the state clones the random stream with it, and the sequence is a pure function
of the seed and the *order of the draws*.

This is why `rng.chance()` consumes a draw even at 0 % and 100 %. Skipping the
draw would make the stream depend on the odds, and the odds depend on the
player's build — two players with the same seed would diverge.

**Two things make a run reproducible, and only two: the seed, and the ordered
list of actions.** That is the entire save. No board state, no snapshot, no
score. It is also why `CLAUDE.md` boundary 8 bans `Date.now()` and
`Math.random()` from `src/game/core/`: one clock read makes yesterday's runs
unreplayable and silently breaks the leaderboard.

### The daily seed

`deriveDailySeed(dateIso, secret)` in `src/lib/daily/seed.ts` is an HMAC-SHA256
of `devgame-daily:YYYY-MM-DD` under `DAILY_SEED_SECRET`, truncated to 16 hex
characters. `utcDate()` puts the day boundary at midnight UTC.

`getDailySeed()` in `src/lib/daily/store.ts` memoises it in the `DailySeed`
table. The derivation is deterministic, so storing it looks redundant — until
the secret is rotated, at which point every past board would silently describe
a different game. The row is what keeps yesterday's scores meaning something.

**It is never derived in the browser.** Deriving it client-side would mean
shipping the secret, and anyone holding the secret can generate tomorrow's map
and practise on it before the day starts. `CLAUDE.md` boundary 12. `submitRun`
re-checks it: a daily submission whose seed is not today's server seed is
rejected with `The daily changed at midnight UTC`, and `dailyDate` is taken
from the server clock, never from the save's own `createdAt`.

### Reproducing a player's run locally

The save is everything you need, and `replayRun` is a pure function:

1. Get the save. From Postgres, `Run.save` is the whole `RunSaveDto` verbatim:
   ```sql
   SELECT save FROM "Run" WHERE "clientRunId" = '<uuid>';
   ```
   From a browser, `localStorage` key `devgame:run:v1`.
2. Write it to a JSON file and feed it to `replayRun`:
   ```ts
   import { replayRun } from "@/game";
   const result = replayRun(JSON.parse(await Bun.file("run.json").text()));
   ```
3. `result.valid` tells you whether the log replays at all; `failedAt` is the
   index of the action that was not legal. `result.stats.hash` is
   `hashState(state)` — the fingerprint of everything that decides what happens
   next, with the log excluded because a translated line must not change it.
4. To watch it happen, step it by hand through `applyAction` from
   `src/game/core/rules/reducer.ts` and print the events, the way
   `scripts/sim.ts` does under `--verbose`.

If the replay is invalid but the player's screenshot is real, the usual cause
is a rules change: check whether the save's `rules` field matches today's
`RULES_FINGERPRINT`.

## Adding or changing translated text

The engine never produces a display string. It produces `{ key, params }`, and
React (`useGameText` in `src/components/hud/useGameText.ts`) or the Pixi scene
looks the key up. This is what lets the server replay a run without pulling a
translation layer in.

1. Emit it from the engine with `text(key, params)` from
   `src/game/core/i18n.ts`. The key is a dot path inside the `game` namespace.
2. **A parameter that names something is a key reference, not a string.** The
   engine knows a skill's id, not its name, so it passes a
   `ref("skills.linter.name")` and `renderText()` resolves it before
   substituting. Marking those explicitly beats guessing from the shape of a
   string:
   ```ts
   text("log.ticket_merged_skill", { skill: ref(`skills.${event.skillId}.name`) })
   ```
3. Add the key to **both** `messages/fr.json` and `messages/en.json`. FR is the
   source of truth; EN is kept in step with it.
4. ICU placeholder names must match between the two files.

`tests/messages.test.ts` enforces three things: identical key sets between the
catalogues, no empty message, and identical ICU placeholder names per key. It
also derives the expected content keys from the id arrays — skills, relics,
tree nodes, upgrades and profiles need `name` and `desc`; branches and ranks a
`name`; failure, merge and ambient events
need `title` and `log`; node kinds need `name` and `desc`.

**What it does not check**: keys the engine emits that are not derived from a
content table — everything under `game.log.*` and `game.notes.*`. A new log
line or a new preview note can be added to the engine, pass the whole suite,
and render as a raw `log.node_done.ai` in a player's face. Those are found by
reading `src/game/core/log.ts` and `src/game/core/rules/preview.ts` against the
catalogues; `/i18n-check` does it mechanically.

**What to verify.** `bun test tests/messages.test.ts`, then load `/play` in
both locales and read the commit log.

## Database changes

Read `docs/database.md` first; it has the schema, the index rules and the
reasoning. What follows is only the part that bites during maintenance.

### The two hand-written partial unique indexes

Prisma cannot express a `WHERE` clause on an index, so these two exist only in
SQL files:

| Index | Migration | What it guarantees |
|---|---|---|
| `Run_one_in_progress` | `00000000000001_run_one_in_progress` | At most one `in_progress` run per player per mode |
| `Run_one_finished_per_fingerprint` | `00000000000002_run_unique_fingerprint` | One finished submission per player per run fingerprint |

**Prisma does not know either of them exists.** It will not reproduce them in a
`migrate diff`, it will not warn you that they are missing, and `migrate dev`
will happily hand you a schema without them.

The symptoms if they go missing are both silent:

- Without `Run_one_in_progress`, a player can hold two in-progress runs per
  mode. Resume breaks, because "the run still in progress" is no longer a
  single row — and it breaks for that player only, days later.
- Without `Run_one_finished_per_fingerprint`, the same good run can be
  submitted repeatedly under fresh client-chosen `clientRunId`s and credited
  every time. The application-level duplicate check in `submitRun` catches the
  common case; the index is what catches the race.

Both are deliberately *partial*: an abandoned run and the finished submission
of the same game legitimately share a fingerprint.

### The check

```sql
SELECT indexname, indexdef FROM pg_indexes
WHERE indexname IN ('Run_one_in_progress', 'Run_one_finished_per_fingerprint');
```

Two rows, or the invariant is gone. Locally:

```bash
docker exec devgame-postgres psql -U devgame -d devgame \
  -c "SELECT indexname FROM pg_indexes WHERE tablename = 'Run';"
```

### Squashing or regenerating migrations

**Re-add both indexes by hand.** A squash regenerates from
`prisma/schema.prisma`, and the schema does not contain them — only comments
pointing at the migrations that do. Copy the `CREATE UNIQUE INDEX` statements
out of the two migration files into the squashed one, keep the comments
explaining why they are hand-written, and run the check above against a fresh
database before trusting it.

The same applies to anything else hand-written: the epoch backfill in
`00000000000003_run_rules_epoch` drops and recreates two leaderboard indexes
with `rulesEpoch` leading. Those *are* in the schema, so Prisma reproduces
them; the partial ones are not.

### Other rules worth repeating

- Express every index you can in the schema. Prisma will `DROP` anything it
  does not know about on the next `migrate dev` — which is exactly what makes
  the two above a standing liability.
- `prisma migrate reset` destroys data, asks for explicit human consent, and is
  denied in `.claude/settings.json`. Ask the user; do not work around it.
- Better Auth owns `user`, `session`, `account` and `verification`. After
  enabling a plugin, regenerate with `bun x @better-auth/cli@latest generate`
  and apply the diff as a migration. Do not hand-edit those four models.
- The generated client goes to `src/generated/prisma` and is gitignored.
  `bun x prisma generate` recreates it; `postinstall` runs it for you.

## A routine release check

In this order, because each step is cheaper than the one after it.

1. **`bun run check`** — typecheck, then `biome check .`, then `bun test`. This
   is the gate. Nothing ships red.
2. **`bun test tests/content.test.ts`** on its own if you touched content or
   balance, to read the fingerprint failure properly rather than as one line in
   a wall of output.
3. **`bun run sim --runs 300`** if anything under `src/game/` changed. Confirm
   `invariant failures 0`, no `stuck` and no `capped` in any `ends` line, and
   that no policy has started to dominate.
4. **Decide on `RULES_EPOCH`**, using the table above, and say out loud why.
   If it moved, update the pinned fingerprint and add a line to the doc comment
   in `src/game/dto/version.ts`.
5. **`bun x prisma migrate status`** against the target database if there are
   migrations in the diff. Needs the database reachable.
6. **The index check** from [Database changes](#database-changes) if migrations
   were touched at all.
7. **`bun run build`** — the production build, which is stricter than `dev` and
   is where a client/server boundary mistake surfaces. Remember it runs inside
   the image with placeholder env values, because `env.ts` validates at import
   time.
8. **Play one run in each locale.** The suite does not render anything. A raw
   `log.something` in the commit log, a HUD note with an unresolved parameter,
   or a graph that has grown taller than the window are all things only a human
   sees.
