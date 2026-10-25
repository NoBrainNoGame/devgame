/**
 * A random v4 UUID that works over plain HTTP.
 *
 * `crypto.randomUUID` exists only in secure contexts (HTTPS or localhost), so a
 * page served at `http://192.168.x.x` throws on it. `getRandomValues` has no
 * such restriction and is just as random.
 */
export function randomUuid(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  // RFC 9562: version 4 in the high nibble of byte 6, variant 10 in byte 8.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
