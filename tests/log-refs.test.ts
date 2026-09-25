import { describe, expect, test } from "bun:test";

import { ref, renderText, text } from "@/game/core/i18n";
import { appendLog } from "@/game/core/log";

import { newRun } from "./helpers";

/**
 * A reference can carry the parameters its own key needs: an event's title
 * that names a competitor is rendered with the competitor, in the line that
 * opens the event and in the one that answers it.
 */
const catalogue: Record<string, string> = {
  "log.narrative_opened": "event: {title}",
  "log.narrative_answered": "{title}: {choice}",
  "narrative.price_war.title": "{competitor} cuts its prices",
  "narrative.price_war.choices.fight": "fight",
  "competitors.hooli.name": "Hooli",
};
const translate = (key: string, params?: Record<string, string | number>): string =>
  (catalogue[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) =>
    String(params?.[name] ?? `{${name}}`),
  );

describe("references with their own parameters", () => {
  test("resolve all the way down", () => {
    const line = text("log.narrative_opened", {
      title: ref("narrative.price_war.title", { competitor: ref("competitors.hooli.name") }),
    });
    expect(renderText(translate, line)).toBe("event: Hooli cuts its prices");
  });

  test("an event's opening and its answer both name the competitor", () => {
    const state = newRun("log-refs");
    appendLog(state, [
      { type: "narrative_opened", eventId: "price_war", competitorId: "hooli" },
      { type: "narrative_answered", eventId: "price_war", choice: "fight" },
    ]);
    const [opened, answered] = state.log.slice(-2);
    if (opened === undefined || answered === undefined) throw new Error("no lines");
    expect(renderText(translate, opened.text)).toBe("event: Hooli cuts its prices");
    expect(renderText(translate, answered.text)).toBe("Hooli cuts its prices: fight");
  });
});
