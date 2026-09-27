import {
  arc,
  box,
  cone,
  cylinder,
  extrude,
  line,
  type Mesh,
  merge,
  move,
  normalise,
  polyline,
  repeat,
  ring,
  rotateX,
  rotateY,
  rotateZ,
  scale,
  sphere,
  torus,
  type Vec3,
} from "@/components/hud/wireframe/mesh";
import type { AcquisitionId, DevRank, UpgradeId } from "@/game/content";

/**
 * A model for everything money buys: every upgrade, every company, every
 * rank. Simple on purpose — a silhouette the eye reads at tile size, a dozen
 * primitives at most. Exhaustive records, so a new upgrade, acquisition or
 * rank does not compile without its model.
 */

const grid = (columns: number, rows: number, step: number): Vec3[] =>
  Array.from(
    { length: columns * rows },
    (_, i): Vec3 => [
      ((i % columns) - (columns - 1) / 2) * step,
      (Math.floor(i / columns) - (rows - 1) / 2) * step,
      0,
    ],
  );

/** A rack: the frame, its units, a light per unit. */
function rack(): Mesh {
  const units = Array.from({ length: 7 }, (_, i) => -0.95 + (i + 1) * 0.2375);
  return merge(
    box(0.8, 1.9, 0.9),
    ...units.map((y) => line([-0.4, y, 0.45], [0.4, y, 0.45])),
    ...units.map((y) => move(box(0.06, 0.05, 0.02), [0.28, y + 0.1, 0.46])),
  );
}

/** A head and shoulders: the people the shop sells are people. */
function bust(): Mesh {
  return merge(
    scale(sphere(0.4, 6, 8), [1, 1.15, 1]),
    move(cylinder(0.13, 0.16, 8), [0, -0.53, 0]),
    move(cylinder(0.66, 0.4, 14, { topRadius: 0.42, rings: 3, sideStride: 2 }), [0, -0.8, 0]),
  );
}

function laptop(): Mesh {
  return merge(box(0.7, 0.03, 0.45), move(rotateX(box(0.7, 0.45, 0.02), -0.25), [0, 0.22, -0.26]));
}

function building(width: number, height: number, floors: number): Mesh {
  const levels = Array.from(
    { length: floors - 1 },
    (_, i) => -height / 2 + ((i + 1) * height) / floors,
  );
  return merge(
    box(width, height, width),
    ...levels.map((y) => line([-width / 2, y, width / 2], [width / 2, y, width / 2])),
    ...levels.map((y) => line([width / 2, y, -width / 2], [width / 2, y, width / 2])),
  );
}

/** A square collector, facing out from the centre along X. */
function panel(): Mesh {
  return merge(box(0.02, 0.2, 0.2), line([0, -0.1, 0], [0, 0.1, 0]));
}

const UPGRADE_MODELS: Record<UpgradeId, () => Mesh> = {
  servers: rack,
  datacenter: () =>
    merge(
      box(2.2, 0.9, 1.4),
      repeat(box(0.3, 0.7, 1.1), [
        [-0.75, -0.1, 0],
        [-0.25, -0.1, 0],
        [0.25, -0.1, 0],
        [0.75, -0.1, 0],
      ]),
      repeat(cylinder(0.18, 0.1, 12), [
        [-0.6, 0.5, 0],
        [0, 0.5, 0],
        [0.6, 0.5, 0],
      ]),
    ),
  region: () => merge(sphere(0.95, 7, 10), rotateX(ring(1.3, 40), 0.35)),
  orbital_station: () =>
    merge(
      torus(1.1, 0.14, 28, 5),
      cylinder(0.22, 1.2, 10, { rings: 3 }),
      ...[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2;
        return line(
          [Math.cos(a) * 0.22, 0, Math.sin(a) * 0.22],
          [Math.cos(a) * 0.96, 0, Math.sin(a) * 0.96],
        );
      }),
      move(box(1.6, 0.02, 0.35), [0, 0.7, 0]),
    ),
  // A small sun and the panels round it, on three tilted orbits.
  dyson_swarm: () =>
    merge(
      sphere(0.35, 5, 8),
      ...[0, 1, 2].map((orbit) => {
        const collectors = Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2 + orbit * 0.4;
          return move(rotateY(panel(), -a), [Math.cos(a), 0, Math.sin(a)]);
        });
        return rotateZ(rotateX(merge(ring(1, 32), ...collectors), 0.9 * (orbit - 1)), 0.5 * orbit);
      }),
    ),
  death_star: () => {
    const dish = merge(
      ...[0.25, 0.12].map((r) =>
        polyline(
          Array.from({ length: 20 }, (_, i): Vec3 => {
            const a = (i / 20) * Math.PI * 2;
            return [Math.cos(a) * r, Math.sin(a) * r, 0];
          }),
          true,
        ),
      ),
    );
    return merge(
      sphere(1, 9, 12),
      ring(1.01, 48, 0.04),
      ring(1.01, 48, -0.04),
      move(dish, [0.35, 0.45, 0.82]),
    );
  },
  // Three racks, each bigger than the last.
  autoscaling: () =>
    merge(
      move(scale(rack(), 0.45), [-0.9, -0.5, 0]),
      move(scale(rack(), 0.7), [-0.2, -0.28, 0]),
      move(scale(rack(), 1), [0.7, 0, 0]),
    ),
  marketing: () =>
    merge(
      rotateZ(cylinder(0.18, 1.1, 14, { topRadius: 0.6, rings: 3 }), -Math.PI / 2),
      move(box(0.12, 0.45, 0.12), [-0.2, -0.35, 0]),
    ),
  // A cut gem.
  premium_plan: () => {
    const crown = ring(0.55, 8, 0.25);
    const girdle = ring(0.9, 8, 0);
    const edges = [...crown.edges, ...girdle.edges.map(([a, b]) => [a + 8, b + 8] as const)];
    for (let i = 0; i < 8; i += 1) edges.push([i, i + 8], [i + 8, 16]);
    const apex: Vec3 = [0, -1, 0];
    return { vertices: [...crown.vertices, ...girdle.vertices, apex], edges };
  },
  mobile_app: () =>
    merge(
      box(0.9, 1.8, 0.1),
      move(box(0.78, 1.5, 0.01), [0, 0, 0.06]),
      repeat(
        box(0.16, 0.16, 0.01),
        grid(3, 4, 0.26).map(([x, y]): Vec3 => [x, y + 0.08, 0.07]),
      ),
    ),
  enterprise_plan: () =>
    merge(
      box(1.4, 0.95, 0.4),
      line([-0.7, 0.15, 0.2], [0.7, 0.15, 0.2]),
      move(
        extrude(
          [
            [-0.25, 0],
            [-0.25, 0.2],
            [0.25, 0.2],
            [0.25, 0],
          ],
          0.08,
        ),
        [0, 0.47, 0],
      ),
    ),
  // A hub and the services plugged into it.
  platform_api: () => {
    const ends: Vec3[] = [
      [1, 0.5, 0],
      [-1, 0.5, 0],
      [0, -0.6, 0.9],
      [0, -0.6, -0.9],
    ];
    return merge(
      box(0.5, 0.5, 0.5),
      repeat(box(0.28, 0.28, 0.28), ends),
      ...ends.map((end) => line([0, 0, 0], end)),
    );
  },
  marketplace: () =>
    merge(
      box(1.6, 0.6, 0.7),
      move(
        extrude(
          [
            [-0.85, 0],
            [0.85, 0],
            [0.7, 0.3],
            [-0.7, 0.3],
          ],
          0.9,
        ),
        [0, 1.05, 0],
      ),
      repeat(line([0, 0, 0], [0, 0.75, 0]), [
        [-0.75, 0.3, 0.33],
        [0.75, 0.3, 0.33],
      ]),
    ),
  // A chip, its pins, and nothing to say what it runs.
  ai_agents: () =>
    merge(
      box(1.2, 0.12, 1.2),
      move(box(0.6, 0.04, 0.6), [0, 0.08, 0]),
      ...Array.from({ length: 5 }, (_, i) => -0.4 + i * 0.2).flatMap((t) => [
        line([t, -0.06, 0.6], [t, -0.2, 0.8]),
        line([t, -0.06, -0.6], [t, -0.2, -0.8]),
        line([0.6, -0.06, t], [0.8, -0.2, t]),
        line([-0.6, -0.06, t], [-0.8, -0.2, t]),
      ]),
    ),
  ai_subscription: () =>
    merge(
      extrude(
        [
          [-0.9, -0.3],
          [-0.9, 0.6],
          [0.9, 0.6],
          [0.9, -0.3],
          [-0.2, -0.3],
          [-0.55, -0.65],
          [-0.5, -0.3],
        ],
        0.3,
      ),
      repeat(box(0.14, 0.14, 0.14), [
        [-0.4, 0.15, 0],
        [0, 0.15, 0],
        [0.4, 0.15, 0],
      ]),
    ),
  // A screen, lines of code, a stand.
  ide_licence: () =>
    merge(
      box(1.6, 1, 0.08),
      ...[0.3, 0.15, 0, -0.15, -0.3].map((y, i) =>
        line([-0.65 + (i % 2) * 0.15, y, 0.05], [0.1 + ((i * 37) % 5) * 0.1, y, 0.05]),
      ),
      move(cylinder(0.05, 0.4, 6), [0, -0.7, 0]),
      move(box(0.6, 0.04, 0.35), [0, -0.9, 0]),
    ),
  coffee_machine: () =>
    merge(
      box(0.9, 1.4, 0.8),
      move(box(0.9, 0.25, 0.8), [0, -0.3, 0.2]),
      move(cylinder(0.14, 0.24, 12), [0, -0.45, 0.2]),
      move(box(0.5, 0.25, 0.02), [0, 0.35, 0.41]),
    ),
  dev_tooling: () =>
    merge(
      box(1.4, 0.6, 0.6),
      line([-0.7, 0.15, 0.3], [0.7, 0.15, 0.3]),
      move(
        extrude(
          [
            [-0.3, 0],
            [-0.3, 0.25],
            [0.3, 0.25],
            [0.3, 0],
          ],
          0.08,
        ),
        [0, 0.3, 0],
      ),
    ),
  // A camera on a pole: it watches the work, then does it.
  ai_supervisor: () =>
    merge(
      box(0.9, 0.35, 0.4),
      move(rotateZ(cylinder(0.14, 0.2, 10), Math.PI / 2), [0.55, 0, 0]),
      line([-0.2, -0.18, 0], [-0.2, -1, 0]),
      move(box(0.4, 0.05, 0.4), [-0.2, -1, 0]),
    ),

  // An open floor: desks under one roof.
  coworking: () =>
    merge(
      box(2, 0.8, 1.4),
      repeat(box(0.5, 0.05, 0.35), [
        [-0.45, -0.2, -0.3],
        [0.45, -0.2, -0.3],
        [-0.45, -0.2, 0.3],
        [0.45, -0.2, 0.3],
      ]),
    ),
  office: () => building(0.9, 2, 6),
  campus: () =>
    merge(
      move(building(0.6, 1.2, 4), [-0.7, 0.2, 0]),
      move(building(0.7, 0.8, 3), [0.4, 0, -0.3]),
      move(building(0.5, 1.6, 5), [0.3, 0.4, 0.6]),
      move(box(2.4, 0.01, 2), [0, -0.4, 0]),
    ),
  // A platform at sea, its legs and its tower.
  offshore_hub: () =>
    merge(
      box(1.6, 0.12, 1.2),
      ...(
        [
          [-0.7, -0.5],
          [0.7, -0.5],
          [-0.7, 0.5],
          [0.7, 0.5],
        ] as const
      ).map(([x, z]) => line([x, -0.06, z], [x, -0.9, z])),
      move(cylinder(0.35, 1, 4, { topRadius: 0.05, sideStride: 1 }), [-0.3, 0.56, 0]),
      move(box(0.5, 0.35, 0.5), [0.45, 0.24, 0.2]),
      ring(1.2, 24, -0.75),
    ),
  // A long habitat, turning, with its panels out.
  orbital_campus: () =>
    merge(
      rotateZ(cylinder(0.45, 2.2, 12, { rings: 5, sideStride: 3 }), Math.PI / 2),
      line([0, 0, 0.45], [0, 0, 0.8]),
      line([0, 0, -0.45], [0, 0, -0.8]),
      move(box(1.2, 0.02, 0.6), [0, 0, 1.1]),
      move(box(1.2, 0.02, 0.6), [0, 0, -1.1]),
    ),
};

const ACQUISITION_MODELS: Record<AcquisitionId, () => Mesh> = {
  // A rocket that has not left yet.
  startup: () =>
    merge(
      cylinder(0.3, 1.1, 10),
      move(cone(0.3, 0.5, 10), [0, 0.8, 0]),
      ...[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2;
        return polyline([
          [Math.cos(a) * 0.3, -0.25, Math.sin(a) * 0.3],
          [Math.cos(a) * 0.55, -0.6, Math.sin(a) * 0.55],
          [Math.cos(a) * 0.3, -0.55, Math.sin(a) * 0.3],
        ]);
      }),
    ),
  // Bars, climbing.
  scaleup: () =>
    merge(
      ...[0.4, 0.75, 1.1, 1.6].map((h, i) =>
        move(box(0.35, h, 0.35), [-0.6 + i * 0.4, -0.8 + h / 2, 0]),
      ),
    ),
  // A target.
  competitor: () =>
    merge(
      ...[0.9, 0.6, 0.3].map((r) => rotateX(ring(r, 24), Math.PI / 2)),
      line([0.9, 0.5, 1.2], [0, 0, 0]),
    ),
  conglomerate: () =>
    merge(
      building(0.7, 2.2, 7),
      move(building(0.5, 1.4, 4), [-0.7, -0.4, 0.2]),
      move(building(0.45, 1, 3), [0.65, -0.6, -0.1]),
      move(cone(0.2, 0.5, 6), [0, 1.35, 0]),
    ),
};

const RANK_MODELS: Record<DevRank, () => Mesh> = {
  junior: () => merge(bust(), move(laptop(), [0, -0.95, 0.55])),
  // Headphones on: two tickets at a time, and no interruptions.
  mid: () =>
    merge(
      bust(),
      move(arc(0.42, 0.15, Math.PI - 0.15, 12), [0, 0.06, 0]),
      move(rotateZ(cylinder(0.12, 0.08, 8), Math.PI / 2), [-0.42, 0.06, 0]),
      move(rotateZ(cylinder(0.12, 0.08, 8), Math.PI / 2), [0.42, 0.06, 0]),
    ),
  // Glasses, and a second screen.
  senior: () =>
    merge(
      bust(),
      move(rotateX(ring(0.09, 10), Math.PI / 2), [-0.13, 0.05, 0.36]),
      move(rotateX(ring(0.09, 10), Math.PI / 2), [0.13, 0.05, 0.36]),
      line([-0.04, 0.05, 0.36], [0.04, 0.05, 0.36]),
      move(box(0.6, 0.4, 0.03), [-0.38, -0.9, 0.6]),
      move(box(0.6, 0.4, 0.03), [0.38, -0.9, 0.6]),
    ),
};

const built = new Map<string, Mesh>();

function memo(key: string, build: () => Mesh): Mesh {
  const held = built.get(key);
  if (held !== undefined) return held;
  const mesh = normalise(build());
  built.set(key, mesh);
  return mesh;
}

export function upgradeModel(id: UpgradeId): Mesh {
  return memo(`upgrade:${id}`, UPGRADE_MODELS[id]);
}

export function acquisitionModel(id: AcquisitionId): Mesh {
  return memo(`acquisition:${id}`, ACQUISITION_MODELS[id]);
}

export function rankModel(rank: DevRank): Mesh {
  return memo(`rank:${rank}`, RANK_MODELS[rank]);
}
