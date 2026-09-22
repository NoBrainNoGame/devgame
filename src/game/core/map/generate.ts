import type { SkillId } from "@/game/content";
import { BALANCE } from "@/game/core/balance";
import { assignLanes, DEV_LANE, MAIN_LANE } from "@/game/core/map/layout";
import type { Rng } from "@/game/core/rng";
import type { Branch, BranchId, DetourKind, MapNode, NodeId, NodeKind } from "@/game/core/types";

/**
 * One sprint of git graph, in the shape a team actually works in.
 *
 * Two long-lived branches carry no work at all. **`dev`** is where features are
 * integrated: it opens on a back-merge from `main` and then takes one merge per
 * feature delivered. **`main`** receives exactly two
 * nodes per sprint — the `dev → main` merge that ships it, and the release —
 * so the leftmost column reads as a history of sprints rather than of commits.
 *
 * Everything else happens on a feature branch that leaves `dev` and comes back.
 * That is what makes a merge mean something: a merge is the end of a feature,
 * never "one more commit".
 *
 * So the decision at every merge is *which feature to build next*. Two or three
 * branches are offered, each with its own length, its own offers and possibly
 * its own skill; you walk one and the others are never written. The commits
 * inside a branch are progress within that feature, not features of their own —
 * and a commit that offers a detour is still a commit on that branch, written
 * differently, not a fork.
 *
 * Everything is drawn from the run's PRNG, so the same seed always produces the
 * same sprint. That is what makes a run replayable on the server.
 */

export interface SprintPlan {
  nodes: MapNode[];
  branches: Branch[];
  /** Nodes on `dev`: the anchor plus one merge per feature. The race runs here. */
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

  // The sprint opens with `main` merged back into `dev`, which is what a team
  // does the morning a sprint starts.
  const start = makeNode(serial, sprint, "sprint_start", offset, { lane: DEV_LANE });
  nodes.push(start);

  const devLine: MapNode[] = [start];
  let from = start;
  let depth = offset;

  for (let feature = 0; feature < featureCount; feature += 1) {
    // Never more options than the skill pool can tell apart. One fast branch
    // plus one per skill still on offer. With the pool dry that is a single
    // branch, which the graph walks by itself — honest, and better than two
    // cards that grant the same nothing for the same commits.
    const optionCount = Math.min(
      rng.int(map.featureOptions.min, map.featureOptions.max),
      1 + pool.length,
    );

    const built: BuiltBranch[] = [];
    let span = 0;

    // The options have to sit on a frontier: no branch may cost more than
    // another and grant less, or it is not an option, it is a worse version of
    // the one beside it.
    //
    // So exactly one option is the fast one — short, grants nothing — and every
    // other carries a skill and is strictly longer than it. "Deliver now" against
    // "spend these extra commits on something lasting", every time.
    const plainLength = rng.int(map.featureBranchLength.min, map.featureBranchLength.max);
    const plainIndex = rng.int(0, optionCount - 1);

    for (let option = 0; option < optionCount; option += 1) {
      const branch = buildBranch(depth, plainLength, option !== plainIndex);
      built.push(branch);
      span = Math.max(span, branch.tail.depth - depth);
    }

    // Every option merges into the same node: the feature lands on `dev`
    // whichever one you picked, and the ones you did not pick are never
    // written. The merge sits one clear step past the longest of them.
    const mergeDepth = depth + span + 1;
    const merge = makeNode(serial, sprint, "feature_merge", mergeDepth, { lane: DEV_LANE });

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
    devLine.push(merge);

    from = merge;
    depth = mergeDepth;
  }

  // Shipping the sprint. This is the only thing that ever touches `main`: `dev`
  // merged into it, and the release that tags what was merged. It is plumbing
  // rather than a decision, so both are walked automatically.
  const sprintMerge = makeNode(serial, sprint, "sprint_merge", depth + 1, { lane: MAIN_LANE });
  const release = makeNode(serial, sprint, "release", depth + 2, { lane: MAIN_LANE });

  from.next = [sprintMerge.id];
  sprintMerge.next = [release.id];

  nodes.push(sprintMerge, release);

  // A sprint that offers no skill at all is a sprint with nothing to build
  // towards. Rare — six or more branches would all have to miss a 60 % draw —
  // but rare is not never, so the first branch gets one.
  if (offeredSkills.length === 0 && pool.length > 0) {
    const first = branches.find((branch) => branch.kind === "feature");
    const skillId = pool[0];
    if (first !== undefined && skillId !== undefined) {
      first.skillId = skillId;
      offeredSkills.push(skillId);
    }
  }

  assignLanes(nodes);

  return {
    nodes,
    branches,
    length: devLine.length,
    startId: start.id,
    releaseId: release.id,
    offeredSkills,
  };

  /**
   * One feature branch: a chain of commits, its own optional detours, and
   * sometimes a bifurcation of its own. The caller wires its tail to the merge.
   */
  function buildBranch(from: number, plainLength: number, wantsSkill: boolean): BuiltBranch {
    const branchId: BranchId = `b${branchSerial.next}`;
    branchSerial.next += 1;

    // The skill is drawn first, because it is what the branch costs. A branch
    // that grants one is strictly longer than the fast option beside it — that
    // is the trade the whole choice is made of.
    const skillId = pool.length > 0 && wantsSkill ? rng.pick(pool) : undefined;
    if (skillId !== undefined) pool.splice(pool.indexOf(skillId), 1);

    const length =
      skillId === undefined
        ? plainLength
        : plainLength + rng.int(map.skillBranchExtraCommits.min, map.skillBranchExtraCommits.max);

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

    // ---- what a commit may be written as ----------------------------------
    // Not a fork. A refactor, a squash, a rebase is a commit on this branch
    // written differently, so it is an *offer* carried by a node rather than a
    // node of its own: the graph stays a chain, and the choice lives in the
    // panel where its price can be read.
    for (const node of chain) {
      if (!rng.chance(map.detourPct)) continue;
      node.offers = rng.weighted(DETOURS);
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

const DETOURS: { value: DetourKind; weight: number }[] = [
  { value: "refactor", weight: BALANCE.map.detourWeights.refactor },
  { value: "risky", weight: BALANCE.map.detourWeights.risky },
  { value: "chore", weight: BALANCE.map.detourWeights.chore },
  { value: "squash", weight: BALANCE.map.detourWeights.squash },
  { value: "docs", weight: BALANCE.map.detourWeights.docs },
  { value: "rebase", weight: BALANCE.map.detourWeights.rebase },
];
