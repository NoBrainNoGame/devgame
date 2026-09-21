/**
 * FNV-1a, used for two jobs that both need to agree between the browser and the
 * server: turning a seed string into a PRNG cursor, and fingerprinting a run
 * state so tests can assert that a replay landed on exactly the same game.
 */

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export function fnv1a(input: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

export function fnv1aHex(input: string): string {
  return fnv1a(input).toString(16).padStart(8, "0");
}

/**
 * JSON with every object key sorted, so two states that differ only in
 * insertion order hash the same. Undefined values are dropped exactly the way
 * `JSON.stringify` drops them, which keeps optional fields from mattering.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);

  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      const entry = source[key];
      if (entry === undefined) continue;
      out[key] = canonicalize(entry);
    }
    return out;
  }

  return value;
}
