/**
 * What the engine says, and how the page turns it into words.
 *
 * The engine never produces a display string: it emits a key and parameters,
 * and the page translates. Three kinds of parameter: a plain value, a
 * reference to another key (a log line that names a skill carries
 * `skills.linter.name`, not "Linter"), and a sum of money, which the page
 * formats in the unit the run has reached — 842 €, 12,4 k€, 1,20 M€ — since
 * the engine keeps raw integers and has no idea what a thousand looks like.
 */

export type I18nParam = string | number | { key: string } | { money: number };

export interface I18nText {
  key: string;
  params?: Readonly<Record<string, I18nParam>>;
}

export function text(key: string, params?: Record<string, I18nParam>): I18nText {
  return params === undefined ? { key } : { key, params };
}

export function ref(key: string): { key: string } {
  return { key };
}

export function money(value: number): { money: number } {
  return { money: value };
}

export function renderText(
  translate: (key: string, params?: Record<string, string | number>) => string,
  value: I18nText,
  formatMoney: (value: number) => string = (amount) => String(amount),
): string {
  if (value.params === undefined) return translate(value.key);

  const resolved: Record<string, string | number> = {};
  for (const [name, param] of Object.entries(value.params)) {
    resolved[name] =
      typeof param !== "object"
        ? param
        : "money" in param
          ? formatMoney(param.money)
          : translate(param.key);
  }

  return translate(value.key, resolved);
}
