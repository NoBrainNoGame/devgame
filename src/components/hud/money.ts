/**
 * Money on screen. The engine keeps raw integers; the page shows them in the
 * unit the run has reached, so a hundred million reads as "100 M€" and not as
 * a row of zeros. Digits shrink as the number grows: two under ten, one
 * under a hundred, none above — enough to compare, not enough to count.
 */

const UNITS: readonly (readonly [string, number])[] = [
  ["€", 1],
  ["k€", 1e3],
  ["M€", 1e6],
  ["G€", 1e9],
  ["T€", 1e12],
  ["P€", 1e15],
];

export function formatMoney(value: number, locale: string): string {
  const negative = value < 0;
  const magnitude = Math.abs(value);
  let unit = UNITS[0] ?? ["€", 1];
  for (const candidate of UNITS) {
    if (magnitude >= candidate[1]) unit = candidate;
  }
  const scaled = magnitude / unit[1];
  const digits = unit[1] === 1 ? 0 : scaled < 10 ? 2 : scaled < 100 ? 1 : 0;
  const number = new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(scaled);
  return `${negative ? "−" : ""}${number}\u00a0${unit[0]}`;
}
