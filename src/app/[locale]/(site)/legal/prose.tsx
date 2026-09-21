/**
 * The prose kit the three legal pages are built from.
 *
 * There is no typography plugin, so the measure, the rhythm and the list
 * markers are set here once rather than repeated on every paragraph. Nothing
 * in this file holds a string: the pages pass translated text in, which keeps
 * the whole `legal` namespace in the message files.
 */

/** A value the operator still has to supply, e.g. `TODO_PUBLISHER_NAME`. */
export function isPlaceholder(value: string): boolean {
  return /^TODO_[A-Z0-9_]+$/.test(value.trim());
}

export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="mt-8">
      <h2 className="font-semibold text-branch-main text-xs uppercase tracking-widest">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

export function P({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <p className="text-muted-foreground text-sm leading-relaxed">{children}</p>;
}

export function Bullets({ items }: { items: readonly string[] }): React.JSX.Element {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item} className="flex gap-2 text-muted-foreground text-sm leading-relaxed">
          {/* A dash rather than a bullet: the whole site is set in a monospace
              face and reads like a terminal. */}
          <span aria-hidden className="select-none text-line">
            —
          </span>
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}

export interface FieldRow {
  label: string;
  value: string;
}

/**
 * Identity fields — publisher, host, contact. A value still holding its
 * `TODO_` token is shown in the hotfix colour, because a legal notice that
 * ships with a placeholder in it is worse than no page at all.
 */
export function Fields({
  rows,
  placeholderLabel,
}: {
  rows: readonly FieldRow[];
  placeholderLabel: string;
}): React.JSX.Element {
  return (
    <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 border-line border-l-2 pl-4 text-sm sm:grid-cols-[12rem_1fr]">
      {rows.map((row) => (
        <div key={row.label + row.value} className="contents">
          <dt className="text-muted-foreground text-xs sm:text-sm">{row.label}</dt>
          <dd className="min-w-0 break-words">
            {isPlaceholder(row.value) ? (
              <span className="font-semibold text-branch-hotfix" title={placeholderLabel}>
                {row.value}
              </span>
            ) : (
              row.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
