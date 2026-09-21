---
description: Run the headless balance simulator and read the distributions honestly
argument-hint: [runs] [policy]
---

Run the balance simulator and interpret what it says. `$ARGUMENTS` may name a
run count and a policy; default to `bun run sim --runs 300`.

```bash
bun run sim --runs 300             # all four policies
bun run sim --policy careful       # one of: ai | craft | mixed | careful
bun run sim --seed 42              # move the seed window
bun run sim --seed 42 --verbose    # one run, turn by turn
```

`--verbose` prints a single run and ignores `--runs`; with no `--policy` it
uses `mixed`. Otherwise the run starts with a map-generation check over
`min(500, runs * 2)` sprints, then one block per policy.

What a healthy result looks like, and what each line means when it is not:

- `generation → invariant failures 0`. Anything else is a broken graph — a node
  with no exit, a back edge, an unreachable node, two branches colliding in a
  lane. That is a bug in `src/game/core/map/generate.ts`, not balance;
  `bun test tests/map.test.ts` will name the rule.
- `generation → main length` inside `BALANCE.sprintLength` (12–18), and
  `choice points` comfortably above its `min`. A falling `choice points` means
  the map has become a corridor and stopped asking questions.
- `ends` contains **no `stuck` and no `capped`**. `stuck` is a state with no
  legal action — always a bug. `capped` is a run that hit the 4000-iteration
  ceiling — a run that cannot end.
- `burnout` and `fired` should both be represented across the policies. A game
  where nobody is ever fired means the bots are decorative.
- `turns med` with `p10` and `p90`. A `p90` an order of magnitude above the
  median means the distribution is bimodal — most runs die early, a few go
  forever. Say so; the median on its own will lie about it.
- `score med` against `max`. One huge `max` is one lucky run. Compare medians.
- **No policy should dominate.** If one policy's median score is double every
  other's, the trade-off that policy avoids is not costing enough.
- `failures`: a raw count across all runs. An id missing from the line entirely
  can never fire — check its `requiresUnreviewedAi` and `forbiddenOnHotfix`
  flags in `src/game/content/events.ts`.

Report the numbers and your reading of them. Name the specific knob in
`src/game/core/balance.ts` you would move for each problem you find, and what
you expect it to do.

You will NOT change any code. This command measures. If it finds something
worth fixing, hand it to `/tune-balance` or `/change-rule`; do not fix it here,
because a fix applied in the same pass has no clean before-measurement behind
it. You will also not compare two runs taken with different `--seed` or
`--runs` values and call the difference an effect.
