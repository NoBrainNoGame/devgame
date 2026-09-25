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

/**
 * A reference to another key, with the parameters that key needs itself —
 * an event's title that names a competitor carries the competitor.
 */
export interface I18nRef {
  key: string;
  params?: Readonly<Record<string, string | number | I18nRef | { money: number }>>;
}

export type I18nParam = string | number | I18nRef | { money: number };

export interface I18nText {
  key: string;
  params?: Readonly<Record<string, I18nParam>>;
}

export function text(key: string, params?: Record<string, I18nParam>): I18nText {
  return params === undefined ? { key } : { key, params };
}

export function ref(key: string, params?: I18nRef["params"]): I18nRef {
  return params === undefined ? { key } : { key, params };
}

export function money(value: number): { money: number } {
  return { money: value };
}

/** A signed amount as the page writes it: "+5", "−5" with a true minus, "0". */
export function signed(value: number): string {
  if (value > 0) return `+${value}`;
  if (value < 0) return `\u2212${-value}`;
  return "0";
}

export function renderText(
  translate: (key: string, params?: Record<string, string | number>) => string,
  value: I18nText,
  formatMoney: (value: number) => string = (amount) => String(amount),
): string {
  if (value.params === undefined) return translate(value.key);

  const resolve = (params: NonNullable<I18nRef["params"]>): Record<string, string | number> => {
    const resolved: Record<string, string | number> = {};
    for (const [name, param] of Object.entries(params)) {
      resolved[name] =
        typeof param !== "object"
          ? param
          : "money" in param
            ? formatMoney(param.money)
            : param.params === undefined
              ? translate(param.key)
              : translate(param.key, resolve(param.params));
    }
    return resolved;
  };

  return translate(value.key, resolve(value.params));
}
