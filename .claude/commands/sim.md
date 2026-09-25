---
description: Run the headless balance simulator and read the distributions honestly
argument-hint: [runs] [policy]
---

Run the balance simulator and interpret it. `$ARGUMENTS` may name a run count
and a policy; default to `bun run sim --runs 300` (the script alone plays 200).

```bash
bun run sim --runs 300             # all four policies
bun run sim --policy careful       # one of: ai | craft | mixed | careful
bun run sim --seed 42              # move the seed window
bun run sim --turns 3000           # turn ceiling (default 1500)
bun run sim --seed 42 --verbose    # one run, turn by turn
```

`--verbose` plays one run, ignores `--runs`, and defaults to `mixed`.
Otherwise the output opens with a graph check over `min(500, runs * 2)` seeds
of 40 actions, then one block per policy. Healthy means:

- `generation → invariant failures 0`. Otherwise the graph breaks
  `checkInvariants` (`src/game/core/map/graph.ts`): a bug in the rules that
  write nodes (`src/game/core/rules/write.ts`), not balance;
  `bun test tests/map.test.ts` names the rule. `nodes written` is the average
  graph size after those 40 actions.
- `ends` has **no `stuck` and no `capped`**. `stuck`: no legal action, always a
  bug. `capped`: hit the `--turns` ceiling, a run that cannot end. `caught` is
  a lost hack.
- `burnout` and `fired` both appear across policies; nobody fired means
  production's patience is decorative.
- `turns med` with `p10`/`p90`: a `p90` ten times the median means a bimodal
  distribution (most die early, a few go on forever). Say so; the median alone
  lies.
- `score med` against `max`: one huge `max` is one lucky run; compare medians.
- **No policy dominates.** A median score double every other's means the
  trade-off it avoids costs too little.
- `failures`: raw counts over all runs. An id missing from the line can never
  fire; check its `requiresUnreviewedAi` and `forbiddenOnHotfix` flags in
  `src/game/content/events.ts`.

Report the numbers and your reading; for each problem, name the
`src/game/core/balance.ts` knob you would move and what you expect it to do.

Never change code here: this command measures. Hand fixes to `/tune-balance`
or `/change-rule`, since a fix in the same pass has no clean before. Never call
a difference between runs with different `--seed` or `--runs` an effect.
