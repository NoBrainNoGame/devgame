/**
 * Line-only meshes: points and the edges between them, nothing else — no
 * face, no fill, no texture. What the shop's models are built from, in the
 * look of a film's hologram, and cheap enough to turn thirty of them at once
 * on a plain 2D canvas.
 *
 * Every builder returns a new mesh; nothing here mutates its input.
 */

export type Vec3 = readonly [number, number, number];
export type Edge = readonly [number, number];

export interface Mesh {
  vertices: readonly Vec3[];
  edges: readonly Edge[];
}

export const EMPTY: Mesh = { vertices: [], edges: [] };

/** Several meshes as one. */
export function merge(...parts: readonly Mesh[]): Mesh {
  const vertices: Vec3[] = [];
  const edges: Edge[] = [];
  for (const part of parts) {
    const base = vertices.length;
    vertices.push(...part.vertices);
    for (const [a, b] of part.edges) edges.push([a + base, b + base]);
  }
  return { vertices, edges };
}

function mapVertices(mesh: Mesh, f: (v: Vec3) => Vec3): Mesh {
  return { vertices: mesh.vertices.map(f), edges: mesh.edges };
}

export function move(mesh: Mesh, [dx, dy, dz]: Vec3): Mesh {
  return mapVertices(mesh, ([x, y, z]) => [x + dx, y + dy, z + dz]);
}

export function scale(mesh: Mesh, s: number | Vec3): Mesh {
  const [sx, sy, sz] = typeof s === "number" ? [s, s, s] : s;
  return mapVertices(mesh, ([x, y, z]) => [x * sx, y * sy, z * sz]);
}

export function rotateX(mesh: Mesh, angle: number): Mesh {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return mapVertices(mesh, ([x, y, z]) => [x, y * c - z * s, y * s + z * c]);
}

export function rotateY(mesh: Mesh, angle: number): Mesh {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return mapVertices(mesh, ([x, y, z]) => [x * c + z * s, y, -x * s + z * c]);
}

export function rotateZ(mesh: Mesh, angle: number): Mesh {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return mapVertices(mesh, ([x, y, z]) => [x * c - y * s, x * s + y * c, z]);
}

/** Copies of a mesh placed at each offset. */
export function repeat(mesh: Mesh, offsets: readonly Vec3[]): Mesh {
  return merge(...offsets.map((offset) => move(mesh, offset)));
}

export function line(a: Vec3, b: Vec3): Mesh {
  return { vertices: [a, b], edges: [[0, 1]] };
}

/** A path through points, closed back onto its start when asked. */
export function polyline(points: readonly Vec3[], closed = false): Mesh {
  const edges: Edge[] = [];
  for (let i = 1; i < points.length; i += 1) edges.push([i - 1, i]);
  if (closed && points.length > 2) edges.push([points.length - 1, 0]);
  return { vertices: [...points], edges };
}

/** A flat outline in the XY plane, from 2D points, extruded `depth` deep. */
export function extrude(outline: readonly (readonly [number, number])[], depth: number): Mesh {
  const front = outline.map(([x, y]): Vec3 => [x, y, depth / 2]);
  const back = outline.map(([x, y]): Vec3 => [x, y, -depth / 2]);
  const n = outline.length;
  const edges: Edge[] = [];
  for (let i = 0; i < n; i += 1) {
    edges.push([i, (i + 1) % n], [n + i, n + ((i + 1) % n)], [i, n + i]);
  }
  return { vertices: [...front, ...back], edges };
}

export function box(w: number, h: number, d: number): Mesh {
  const vertices: Vec3[] = [];
  for (const x of [-w / 2, w / 2]) {
    for (const y of [-h / 2, h / 2]) {
      for (const z of [-d / 2, d / 2]) vertices.push([x, y, z]);
    }
  }
  const edges: Edge[] = [
    [0, 1],
    [2, 3],
    [4, 5],
    [6, 7],
    [0, 2],
    [1, 3],
    [4, 6],
    [5, 7],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];
  return { vertices, edges };
}

/** A circle in the XZ plane, at height `y`. */
export function ring(radius: number, segments: number, y = 0): Mesh {
  const points = Array.from({ length: segments }, (_, i): Vec3 => {
    const a = (i / segments) * Math.PI * 2;
    return [Math.cos(a) * radius, y, Math.sin(a) * radius];
  });
  return polyline(points, true);
}

/**
 * A vertical cylinder, or a cone's frustum when the radii differ: `rings`
 * circles from bottom to top, joined by every `strideOfSides`-th side.
 */
export function cylinder(
  radius: number,
  height: number,
  segments = 16,
  options: { rings?: number; topRadius?: number; sideStride?: number } = {},
): Mesh {
  const rings = Math.max(2, options.rings ?? 2);
  const top = options.topRadius ?? radius;
  const stride = options.sideStride ?? 2;
  const parts: Mesh[] = [];
  for (let k = 0; k < rings; k += 1) {
    const t = k / (rings - 1);
    parts.push(ring(radius + (top - radius) * t, segments, -height / 2 + height * t));
  }
  const body = merge(...parts);
  const edges = [...body.edges];
  for (let i = 0; i < segments; i += stride) edges.push([i, (rings - 1) * segments + i]);
  return { vertices: body.vertices, edges };
}

/** A cone standing on the XZ plane, point up. */
export function cone(radius: number, height: number, segments = 12): Mesh {
  const base = ring(radius, segments, -height / 2);
  const apex = base.vertices.length;
  const edges: Edge[] = [...base.edges];
  for (let i = 0; i < segments; i += 1) edges.push([i, apex]);
  return { vertices: [...base.vertices, [0, height / 2, 0]], edges };
}

/** Parallels and meridians. */
export function sphere(radius: number, parallels = 6, meridians = 10): Mesh {
  const parts: Mesh[] = [];
  for (let i = 1; i < parallels; i += 1) {
    const p = (i / parallels) * Math.PI;
    parts.push(ring(Math.sin(p) * radius, meridians * 2, Math.cos(p) * radius));
  }
  const steps = 14;
  for (let j = 0; j < meridians; j += 1) {
    const a = (j / meridians) * Math.PI * 2;
    const points = Array.from({ length: steps + 1 }, (_, i): Vec3 => {
      const p = (i / steps) * Math.PI;
      return [
        Math.sin(p) * Math.cos(a) * radius,
        Math.cos(p) * radius,
        Math.sin(p) * Math.sin(a) * radius,
      ];
    });
    parts.push(polyline(points));
  }
  return merge(...parts);
}

/** A ring of tube around the Y axis. */
export function torus(major: number, minor: number, segments = 24, sides = 5): Mesh {
  const vertices: Vec3[] = [];
  const edges: Edge[] = [];
  for (let i = 0; i < segments; i += 1) {
    for (let j = 0; j < sides; j += 1) {
      const a = (i / segments) * Math.PI * 2;
      const b = (j / sides) * Math.PI * 2;
      const r = major + minor * Math.cos(b);
      vertices.push([r * Math.cos(a), minor * Math.sin(b), r * Math.sin(a)]);
      const id = i * sides + j;
      edges.push([id, i * sides + ((j + 1) % sides)], [id, ((i + 1) % segments) * sides + j]);
    }
  }
  return { vertices, edges };
}

/** An arc of a circle in the XY plane, from angle `from` to `to` (radians). */
export function arc(radius: number, from: number, to: number, segments = 12): Mesh {
  const points = Array.from({ length: segments + 1 }, (_, i): Vec3 => {
    const a = from + ((to - from) * i) / segments;
    return [Math.cos(a) * radius, Math.sin(a) * radius, 0];
  });
  return polyline(points);
}

/**
 * Centred on its bounds and scaled to fit a unit sphere, so every model fills
 * its tile the same way whatever units it was drawn in.
 */
export function normalise(mesh: Mesh): Mesh {
  if (mesh.vertices.length === 0) return mesh;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const v of mesh.vertices) {
    for (let k = 0; k < 3; k += 1) {
      const c = v[k] ?? 0;
      min[k] = Math.min(min[k] ?? c, c);
      max[k] = Math.max(max[k] ?? c, c);
    }
  }
  const centre: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const centred = move(mesh, [-centre[0], -centre[1], -centre[2]]);
  let radius = 0;
  for (const [x, y, z] of centred.vertices) radius = Math.max(radius, Math.hypot(x, y, z));
  return radius === 0 ? centred : scale(centred, 1 / radius);
}
