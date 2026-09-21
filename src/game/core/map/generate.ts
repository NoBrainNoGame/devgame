import type { SkillId } from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { assignLanes } from "@/game/core/map/layout";
import type { Rng } from "@/game/core/rng";
import type { Branch, BranchId, MapNode, NodeId, NodeKind } from "@/game/core/types";

/**
 * One sprint of git graph.
 *
 * `main` carries no work. It is a spine of merge commits — the sprint anchor,
 * one merge per feature delivered, the sprint merge, the release — and every
 * line of work happens on a branch that leaves it and comes back. That is what
 * a trunk-based repository looks like, and it is what makes a merge mean
 * something: a merge is the end of a feature, never "one more commit".
 *
 * So the decision at every merge is *which feature to build next*. Two or three
 * branches are offered, each with its own length, its own detours and possibly
 * its own skill; you walk one and the others are never written. The commits
 * inside a branch are progress within that feature, not features of their own.
 *
 * Everything is drawn from the run's PRNG, so the same seed always produces the
 * same sprint. That is what makes a run replayable on the server.
 */

export interface SprintPlan {
  nodes: MapNode[];
  branches: Branch[];
  /** Number of main-line nodes: the anchor, the merges, and the tail. */
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

interface BuiltBranch {
  head: MapNode;
  tail: MapNode;
  nodes: MapNode[];
  /** The feature itself, followed by any branch that left it. */
  branches: Branch[];
}

export function generateSprint(options: GenerateSprintOptions): SprintPlan {
  const { sprint, offset, rng, serial, branchSerial } = options;
  const { map } = BALANCE;

  const featureCount = rng.int(map.featuresPerSprint.min, map.featuresPerSprint.max);

  const nodes: MapNode[] = [];
  const branches: Branch[] = [];
  const offeredSkills: SkillId[] = [];
  const pool = [...options.skillPool];

  const start = makeNode(serial, sprint, "sprint_start", offset);
  nodes.push(start);

  const main: MapNode[] = [start];
  let from = start;
  let depth = offset;

  for (let feature = 0; feature < featureCount; feature += 1) {
    const optionCount = rng.int(map.featureOptions.min, map.featureOptions.max);

    const built: BuiltBranch[] = [];
    let span = 0;

    for (let option = 0; option < optionCount; option += 1) {
      const branch = buildBranch(depth);
      built.push(branch);
      span = Math.max(span, branch.tail.depth - depth);
    }

    // Every option merges into the same node: the feature lands on `main`
    // whichever one you picked, and the ones you did not pick are never
    // written. The merge sits one clear step past the longest of them.
    const mergeDepth = depth + span + 1;
    const merge = makeNode(serial, sprint, "feature_merge", mergeDepth);

    for (const option of built) {
      option.tail.next = [merge.id];
      const feature = option.branches[0];
      if (feature !== undefined) {
        feature.mergeInto = merge.id;
        if (feature.skillId !== undefined) offeredSkills.push(feature.skillId);
      }
      nodes.push(...option.nodes);
      branches.push(...option.branches);
    }

    from.next = built.map((branch) => branch.head.id).sort();
    nodes.push(merge);
    main.push(merge);

    from = merge;
    depth = mergeDepth;
  }

  // The tail is plumbing rather than a decision: the last merge leads to the
  // sprint merge, which leads to the release.
  const sprintMerge = makeNode(serial, sprint, "sprint_merge", depth + 1);
  const release = makeNode(serial, sprint, "release", depth + 2);

  from.next = [sprintMerge.id];
  sprintMerge.next = [release.id];

  nodes.push(sprintMerge, release);
  main.push(sprintMerge, release);

  assignLanes(nodes);

  return {
    nodes,
    branches,
    length: main.length,
    startId: start.id,
    releaseId: release.id,
    offeredSkills,
  };

  /**
   * One feature branch: a chain of commits, its own optional detours, and
   * sometimes a bifurcation of its own. The caller wires its tail to the merge.
   */
  function buildBranch(from: number): BuiltBranch {
    const branchId: BranchId = `b${branchSerial.next}`;
    branchSerial.next += 1;

    const length = rng.int(map.featureBranchLength.min, map.featureBranchLength.max);

    const chain: MapNode[] = [];
    for (let i = 0; i < length; i += 1) {
      chain.push(makeNode(serial, sprint, "commit", from + 1 + i, { branchId }));
    }
    for (let i = 0; i < length - 1; i += 1) {
      const node = chain[i];
      const successor = chain[i + 1];
      if (node === undefined || successor === undefined) continue;
      node.next = [successor.id];
    }

    const head = chain[0];
    const tail = chain[length - 1];
    if (head === undefined || tail === undefined) {
      throw new Error(`generateSprint: sprint ${sprint} produced an empty branch`);
    }

    const skillId = pool.length > 0 && rng.chance(map.skillBranchPct) ? rng.pick(pool) : undefined;
    if (skillId !== undefined) pool.splice(pool.indexOf(skillId), 1);

    const branch: Branch = {
      id: branchId,
      kind: "feature",
      ...(skillId === undefined ? {} : { skillId }),
      nodeIds: chain.map((node) => node.id),
      mergeInto: tail.id,
      open: false,
      merged: false,
    };

    const built: Branch[] = [branch];
    const extra: MapNode[] = [];

    // ---- detours inside the feature ---------------------------------------
    // A one-node alternative that rejoins two commits later: same distance
    // through the feature, very different cost.
    for (let i = 0; i + 2 < length; i += 1) {
      const branchFrom = chain[i];
      const branchTo = chain[i + 2];
      if (branchFrom === undefined || branchTo === undefined) continue;
      if (branchFrom.next.length > 1) continue;
      if (!rng.chance(map.detourPct)) continue;

      const kind = rng.weighted(DETOURS);
      const detour = makeNode(serial, sprint, kind, branchFrom.depth + 1);
      detour.next = [branchTo.id];
      branchFrom.next = [...branchFrom.next, detour.id].sort();
      extra.push(detour);
    }

    // ---- a feature off a feature ------------------------------------------
    // Two branches open at once is the design's overextension penalty, made
    // concrete. It is optional, so the player chooses to pay for it.
    const subLength = length - 2;
    if (subLength >= 1 && rng.chance(map.subBranchPct)) {
      const subId: BranchId = `b${branchSerial.next}`;
      branchSerial.next += 1;

      const subChain: MapNode[] = [];
      for (let i = 0; i < subLength; i += 1) {
        subChain.push(makeNode(serial, sprint, "commit", head.depth + 1 + i, { branchId: subId }));
      }
      for (let i = 0; i < subLength - 1; i += 1) {
        const node = subChain[i];
        const successor = subChain[i + 1];
        if (node === undefined || successor === undefined) continue;
        node.next = [successor.id];
      }

      const subHead = subChain[0];
      const subTail = subChain[subLength - 1];
      if (subHead !== undefined && subTail !== undefined) {
        subTail.next = [tail.id];
        head.next = [...head.next, subHead.id].sort();
        extra.push(...subChain);

        // A merge is the end of a feature, here too: the parent's last commit
        // becomes the merge that brings the sub-feature home. It keeps its
        // branch, so it stays in the branch's lane rather than on `main`.
        tail.kind = "feature_merge";
        built.push({
          id: subId,
          kind: "subfeature",
          nodeIds: subChain.map((node) => node.id),
          mergeInto: tail.id,
          parentBranchId: branchId,
          open: false,
          merged: false,
        });
      }
    }

    return { head, tail, nodes: [...chain, ...extra], branches: built };
  }
}

const DETOURS = [
  { value: "refactor" as const, weight: BALANCE.map.detourWeights.refactor },
  { value: "risky" as const, weight: BALANCE.map.detourWeights.risky },
  { value: "chore" as const, weight: BALANCE.map.detourWeights.chore },
  { value: "squash" as const, weight: BALANCE.map.detourWeights.squash },
  { value: "docs" as const, weight: BALANCE.map.detourWeights.docs },
  { value: "rebase" as const, weight: BALANCE.map.detourWeights.rebase },
];
