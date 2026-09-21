import type { SkillId } from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { assignLanes } from "@/game/core/map/layout";
import type { Rng } from "@/game/core/rng";
import type { Branch, BranchId, MapNode, NodeId, NodeKind } from "@/game/core/types";

/**
 * One sprint of git graph.
 *
 * The shape the design asks for: `main` runs down the middle, feature branches
 * leave it and come back, and every step offers a real choice. The generator
 * guarantees the last part — a node with one exit is a corridor, and a corridor
 * is not a decision.
 *
 * Everything is drawn from the run's PRNG, so the same seed always produces the
 * same sprint. That is what makes a run replayable on the server.
 */

export interface SprintPlan {
  nodes: MapNode[];
  branches: Branch[];
  /** Number of main-line nodes. Bots race along these. */
  length: number;
  startId: NodeId;
  releaseId: NodeId;
  /** Skills placed on this sprint's branches, so the caller can exclude them. */
  offeredSkills: SkillId[];
}

export interface Serial {
  next: number;
}

export interface GenerateSprintOptions {
  sprint: number;
  /** Depth the sprint starts at, so sprints stack into one continuous graph. */
  offset: number;
  /** Skills that may be placed on a branch this sprint. */
  skillPool: readonly SkillId[];
  rng: Rng;
  serial: Serial;
  branchSerial: Serial;
}

function makeNode(
  serial: Serial,
  sprint: number,
  kind: NodeKind,
  depth: number,
  extra: Partial<MapNode> = {},
): MapNode {
  const id = `${sprint}:${serial.next}`;
  serial.next += 1;
  return {
    id,
    sprint,
    kind,
    lane: 0,
    depth,
    next: [],
    status: "locked",
    ...extra,
  };
}

export function generateSprint(options: GenerateSprintOptions): SprintPlan {
  const { sprint, offset, rng, serial, branchSerial } = options;
  const { map } = BALANCE;

  const length = rng.int(BALANCE.sprintLength.min, BALANCE.sprintLength.max);

  // ---- main line ---------------------------------------------------------
  const main: MapNode[] = [];
  for (let i = 0; i < length; i++) {
    const kind: NodeKind =
      i === 0
        ? "sprint_start"
        : i === length - 2
          ? "sprint_merge"
          : i === length - 1
            ? "release"
            : "commit";
    main.push(makeNode(serial, sprint, kind, offset + i));
  }
  for (let i = 0; i < length - 1; i++) {
    const node = main[i];
    const successor = main[i + 1];
    if (node === undefined || successor === undefined) continue;
    node.next = [successor.id];
  }

  const nodes: MapNode[] = [...main];
  const branches: Branch[] = [];
  const offeredSkills: SkillId[] = [];
  const pool = [...options.skillPool];

  // ---- feature branches --------------------------------------------------
  // `lastMergeDepth` keeps branches from nesting into each other: a new fork
  // may only start once the previous branch has come home.
  let lastMergeIndex = 0;
  const lastForkIndex = length - map.tailReserve;

  for (let i = map.firstForkDepth; i <= lastForkIndex; i++) {
    if (i <= lastMergeIndex) continue;

    const forkNode = main[i];
    if (forkNode === undefined || forkNode.kind !== "commit") continue;

    // The first sprint always opens with a feature: the whole skill economy is
    // invisible until you have merged one, so it must not be left to the dice.
    const guaranteed = sprint === 1 && i <= map.firstForkDepth + 1 && branches.length === 0;
    if (!guaranteed && !rng.chance(map.forkPct)) continue;

    if (pool.length === 0) continue;

    const branchLength = rng.int(map.featureBranchLength.min, map.featureBranchLength.max);
    const mergeIndex = i + branchLength + 1;
    // Merging onto the release node would skip the sprint merge.
    if (mergeIndex > length - 2) continue;

    const mergeTarget = main[mergeIndex];
    if (mergeTarget === undefined) continue;

    const skillId = rng.pick(pool);
    pool.splice(pool.indexOf(skillId), 1);
    offeredSkills.push(skillId);

    const branchId: BranchId = `b${branchSerial.next}`;
    branchSerial.next += 1;

    const branchNodes: MapNode[] = [];
    for (let j = 0; j < branchLength; j++) {
      const isLast = j === branchLength - 1;
      branchNodes.push(
        makeNode(serial, sprint, isLast ? "feature_merge" : "feature", forkNode.depth + 1 + j, {
          branchId,
          ...(isLast ? { skillId } : {}),
        }),
      );
    }
    for (let j = 0; j < branchLength - 1; j++) {
      const node = branchNodes[j];
      const successor = branchNodes[j + 1];
      if (node === undefined || successor === undefined) continue;
      node.next = [successor.id];
    }
    const tail = branchNodes[branchLength - 1];
    const head = branchNodes[0];
    if (tail === undefined || head === undefined) continue;
    tail.next = [mergeTarget.id];

    forkNode.kind = "fork";
    forkNode.next = [...forkNode.next, head.id].sort();

    nodes.push(...branchNodes);
    branches.push({
      id: branchId,
      kind: "feature",
      skillId,
      nodeIds: branchNodes.map((node) => node.id),
      mergeInto: mergeTarget.id,
      open: false,
      merged: false,
    });

    // ---- sub-branch ------------------------------------------------------
    // A branch off a branch: the design's "second feature open" penalty, made
    // concrete. It is optional, so the player chooses to pay for it.
    const subLength = branchLength - 2;
    if (subLength >= 1 && rng.chance(map.subBranchPct)) {
      const subId: BranchId = `b${branchSerial.next}`;
      branchSerial.next += 1;

      const subNodes: MapNode[] = [];
      for (let j = 0; j < subLength; j++) {
        subNodes.push(
          makeNode(serial, sprint, "feature", head.depth + 1 + j, {
            branchId: subId,
          }),
        );
      }
      for (let j = 0; j < subLength - 1; j++) {
        const node = subNodes[j];
        const successor = subNodes[j + 1];
        if (node === undefined || successor === undefined) continue;
        node.next = [successor.id];
      }
      const subTail = subNodes[subLength - 1];
      const subHead = subNodes[0];
      if (subTail !== undefined && subHead !== undefined) {
        subTail.next = [tail.id];
        head.kind = "fork";
        head.next = [...head.next, subHead.id].sort();

        nodes.push(...subNodes);
        branches.push({
          id: subId,
          kind: "subfeature",
          nodeIds: subNodes.map((node) => node.id),
          mergeInto: tail.id,
          parentBranchId: branchId,
          open: false,
          merged: false,
        });
      }
    }

    lastMergeIndex = mergeIndex;
  }

  // ---- detours -----------------------------------------------------------
  // A one-node alternative that rejoins two steps later: same distance, very
  // different cost. This is what keeps a plain stretch of `main` interesting.
  const detourKinds = [
    { value: "refactor" as const, weight: map.detourWeights.refactor },
    { value: "risky" as const, weight: map.detourWeights.risky },
    { value: "chore" as const, weight: map.detourWeights.chore },
    { value: "squash" as const, weight: map.detourWeights.squash },
    { value: "docs" as const, weight: map.detourWeights.docs },
    { value: "rebase" as const, weight: map.detourWeights.rebase },
  ];

  // `length - 4` rather than `length - 3`: landing on `main[length - 1]` would
  // hop straight over the sprint merge, which is the same mistake the feature
  // branches guard against above.
  for (let i = 1; i <= length - 4; i++) {
    const from = main[i];
    const to = main[i + 2];
    if (from === undefined || to === undefined) continue;
    if (from.kind !== "commit") continue;
    if (!rng.chance(map.detourPct)) continue;

    const kind = rng.weighted(detourKinds);
    const detour = makeNode(serial, sprint, kind, from.depth + 1);
    detour.next = [to.id];
    from.next = [...from.next, detour.id].sort();
    nodes.push(detour);
  }

  assignLanes(nodes);

  const start = main[0];
  const release = main[length - 1];
  if (start === undefined || release === undefined) {
    throw new Error(`generateSprint: sprint ${sprint} produced no main line`);
  }

  return {
    nodes,
    branches,
    length,
    startId: start.id,
    releaseId: release.id,
    offeredSkills,
  };
}
