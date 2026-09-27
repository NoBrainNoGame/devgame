"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";

import { setAusterityOverride, useAusterityOverride } from "@/components/hud/austerityOverride";
import type { OnAct } from "@/components/hud/origin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type DevSheet, type DevValues, type GameHandle, gameStore, useGameStore } from "@/game";
import { cn } from "@/lib/utils";

/**
 * The development build's control panel, under the run's column on the
 * left: every value of the run in a form, and the look forced by a slider.
 *
 * The form writes through a `dev_set` action, so an edit survives a reload
 * like any move; the run it touches is never scored. A field keeps showing
 * the run's value, live, until it is typed in; what was typed waits,
 * highlighted, for the apply button.
 *
 * Patience and code health are shown the way the HUD shows them, as the
 * complements of what the engine counts.
 */

type ScalarField =
  | "money"
  | "earned"
  | "tier"
  | "energy"
  | "skillPoints"
  | "xp"
  | "patience"
  | "health"
  | "sprint"
  | "sprintTurn"
  | "filled";

const GROUPS: { key: "resources" | "gauges" | "clock" | "ticket"; fields: ScalarField[] }[] = [
  { key: "resources", fields: ["money", "earned", "tier", "skillPoints", "xp"] },
  { key: "gauges", fields: ["energy", "patience", "health"] },
  { key: "clock", fields: ["sprint", "sprintTurn"] },
  { key: "ticket", fields: ["filled"] },
];

/** A draft's key: a scalar field, or a level as `upgrades.<id>` / `tree.<id>`. */
type Drafts = Record<string, string>;

export function DevPanel({ handle, onAct }: { handle: GameHandle | null; onAct: OnAct }) {
  const t = useTranslations("devPanel");
  const game = useTranslations("game");
  const sheet = useDevSheet(handle);
  const over = useGameStore((state) => state.snapshot?.phase.kind === "game_over");
  const [drafts, setDrafts] = useState<Drafts>({});

  if (sheet === null) return null;

  const scalar = scalarsOf(sheet);
  const pending = Object.keys(drafts).length;
  const draft = (key: string, value: string): void =>
    setDrafts((current) => ({ ...current, [key]: value }));

  const apply = (event: React.FormEvent): void => {
    event.preventDefault();
    const values = valuesOf(drafts, sheet);
    if (values !== null) onAct({ type: "dev_set", values });
    setDrafts({});
  };

  return (
    <section className="space-y-3 border-line border-t border-dashed pt-4 text-xs">
      <div className="space-y-1">
        <h2 className="hud-title font-medium text-branch-hotfix text-xs uppercase tracking-wider">
          {t("title")}
        </h2>
        <p className="text-muted-foreground">{t("hint")}</p>
      </div>

      <AusteritySlider max={sheet.max.tier} />

      <form onSubmit={apply} className="space-y-2">
        {/* `min-w-0`: a fieldset is otherwise as wide as its widest label, past the column. */}
        <fieldset disabled={over} className="min-w-0 space-y-2 disabled:opacity-60">
          {GROUPS.map((group) => (
            <Group key={group.key} title={t(`groups.${group.key}`)} open={group.key !== "clock"}>
              {group.fields.map((field) =>
                scalar[field].value === null ? (
                  <p key={field} className="text-muted-foreground">
                    {t("noTicket")}
                  </p>
                ) : (
                  <Field
                    key={field}
                    label={t(`fields.${field}`)}
                    current={scalar[field].value}
                    max={scalar[field].max}
                    min={field === "sprint" ? 1 : 0}
                    draft={drafts[field]}
                    onDraft={(value) => draft(field, value)}
                  />
                ),
              )}
            </Group>
          ))}

          <Group title={t("groups.upgrades")}>
            {Object.entries(sheet.values.upgrades).map(([id, level]) => (
              <Field
                key={id}
                label={game(`upgrades.${id}.name` as never)}
                current={level}
                max={sheet.max.upgrades[id as keyof DevSheet["max"]["upgrades"]]}
                min={0}
                draft={drafts[`upgrades.${id}`]}
                onDraft={(value) => draft(`upgrades.${id}`, value)}
              />
            ))}
          </Group>

          <Group title={t("groups.tree")}>
            {Object.entries(sheet.values.tree).map(([id, level]) => (
              <Field
                key={id}
                label={game(`tree.${id}.name` as never)}
                current={level}
                max={sheet.max.tree[id as keyof DevSheet["max"]["tree"]]}
                min={0}
                draft={drafts[`tree.${id}`]}
                onDraft={(value) => draft(`tree.${id}`, value)}
              />
            ))}
          </Group>
        </fieldset>

        {/* Stuck to the column's foot while there is something to apply. */}
        <div
          className={cn(
            "flex gap-2 bg-panel py-2",
            pending > 0 && "sticky bottom-0 border-line border-t",
          )}
        >
          <Button type="submit" size="xs" className="flex-1" disabled={pending === 0 || over}>
            {t("apply", { count: pending })}
          </Button>
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={pending === 0}
            onClick={() => setDrafts({})}
          >
            {t("cancel")}
          </Button>
        </div>
      </form>
    </section>
  );
}

/**
 * The run's values, read again whenever the run moves. They come from the
 * handle rather than the snapshot: the snapshot blurs the debt on purpose,
 * and a control panel has to show the number.
 */
function useDevSheet(handle: GameHandle | null): DevSheet | null {
  const [sheet, setSheet] = useState<DevSheet | null>(null);
  useEffect(() => {
    if (handle === null) {
      setSheet(null);
      return;
    }
    setSheet(handle.devSheet());
    return gameStore.subscribe((state, previous) => {
      if (state.snapshot !== previous.snapshot) setSheet(handle.devSheet());
    });
  }, [handle]);
  return sheet;
}

/** The form's scalars as the HUD reads them: patience and health, not their complements. */
function scalarsOf(
  sheet: DevSheet,
): Record<ScalarField, { value: number | null; max: number | null }> {
  const { values, max } = sheet;
  return {
    money: { value: values.money, max: null },
    earned: { value: values.earned, max: null },
    tier: { value: values.tier, max: max.tier },
    energy: { value: values.energy, max: max.energy },
    skillPoints: { value: values.skillPoints, max: null },
    xp: { value: values.xp, max: null },
    patience: { value: max.quality - values.quality, max: max.quality },
    health: { value: max.debt - values.debt, max: max.debt },
    sprint: { value: values.sprint, max: null },
    sprintTurn: { value: values.sprintTurn, max: max.sprintTurn },
    filled: { value: values.filled, max: max.filled },
  };
}

/** What the drafts ask for, in the engine's terms. Null when none parses. */
function valuesOf(drafts: Drafts, sheet: DevSheet): DevValues | null {
  const values: DevValues = {};
  const upgrades: Record<string, number> = {};
  const tree: Record<string, number> = {};
  for (const [key, raw] of Object.entries(drafts)) {
    const number = parseDraft(raw);
    if (number === null) continue;
    const [scope, id] = key.split(".");
    if (scope === "upgrades" && id !== undefined) upgrades[id] = number;
    else if (scope === "tree" && id !== undefined) tree[id] = number;
    else if (key === "patience") values.quality = Math.max(0, sheet.max.quality - number);
    else if (key === "health") values.debt = Math.max(0, sheet.max.debt - number);
    else values[key as Exclude<ScalarField, "patience" | "health">] = number;
  }
  if (Object.keys(upgrades).length > 0) values.upgrades = upgrades as DevValues["upgrades"];
  if (Object.keys(tree).length > 0) values.tree = tree as DevValues["tree"];
  return Object.keys(values).length === 0 ? null : values;
}

function parseDraft(raw: string): number | null {
  if (raw.trim() === "") return null;
  const number = Math.round(Number(raw));
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function Group({
  title,
  open = false,
  children,
}: {
  title: string;
  open?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={open} className="group space-y-1.5">
      <summary className="cursor-pointer select-none text-muted-foreground uppercase tracking-wider transition-colors hover:text-foreground">
        {title}
      </summary>
      <div className="space-y-1 pl-1">{children}</div>
    </details>
  );
}

function Field({
  label,
  current,
  min,
  max,
  draft,
  onDraft,
}: {
  label: string;
  current: number;
  min: number;
  max: number | null;
  draft: string | undefined;
  onDraft: (value: string) => void;
}) {
  const t = useTranslations("devPanel");
  const id = useId();
  const edited = draft !== undefined;
  const invalid = edited && parseDraft(draft) === null;

  return (
    <div className="flex items-center gap-1.5">
      <label htmlFor={id} className="min-w-0 flex-1 text-muted-foreground leading-tight">
        {label}
      </label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        {...(max === null ? {} : { max })}
        step={1}
        value={draft ?? String(current)}
        aria-invalid={invalid}
        className={cn(
          "h-6 w-20 shrink-0 px-1.5 text-right text-xs tabular-nums md:text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
          edited && !invalid && "border-branch-hotfix",
        )}
        onChange={(event) => onDraft(event.target.value)}
      />
      {max === null ? (
        <span className="w-8 shrink-0" />
      ) : (
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="w-8 px-0"
          title={t("maxHint", { max })}
          onClick={() => onDraft(String(max))}
        >
          {t("max")}
        </Button>
      )}
    </div>
  );
}

/**
 * The look, forced. Untouched, it follows the run; dragged, it holds the
 * canvas and the page on the value until the box is unticked.
 */
function AusteritySlider({ max }: { max: number }) {
  const t = useTranslations("devPanel");
  const forced = useAusterityOverride();
  const own = useGameStore((state) => state.snapshot?.austerity ?? 0);
  const shown = forced ?? own;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor="dev-austerity" className="text-muted-foreground">
          {t("austerity")}
        </label>
        <span className="tabular-nums">{shown.toFixed(2)}</span>
      </div>
      <input
        id="dev-austerity"
        type="range"
        min={0}
        max={max}
        step={0.01}
        value={shown}
        className="w-full accent-branch-hotfix"
        onChange={(event) => setAusterityOverride(Number(event.target.value))}
      />
      <label className="flex items-center gap-1.5 text-muted-foreground">
        <input
          type="checkbox"
          checked={forced !== null}
          className="accent-branch-hotfix"
          onChange={(event) => setAusterityOverride(event.target.checked ? own : null)}
        />
        {t("austerityForced")}
      </label>
    </div>
  );
}
