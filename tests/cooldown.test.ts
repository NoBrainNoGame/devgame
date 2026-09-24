import { describe, expect, test } from "bun:test";

import { Cooldown, describeWait } from "../scripts/lib/cooldown";

/**
 * The admin panel's door: a minute after the first wrong password, twice as
 * long after each one that follows, open again the moment a right one comes.
 */
describe("the panel's login cooldown", () => {
  test("closes for a minute, then doubles, and a right password opens it", () => {
    const door = new Cooldown(60_000);
    expect(door.left(0)).toBe(0);
    expect(door.fail(0)).toBe(60_000);
    expect(door.left(30_000)).toBe(30_000);
    expect(door.left(60_000)).toBe(0);
    expect(door.fail(60_000)).toBe(120_000);
    expect(door.fail(180_000)).toBe(240_000);
    expect(door.left(180_000)).toBe(240_000);
    door.succeed();
    expect(door.left(180_000)).toBe(0);
    // Forgotten: the next wrong one starts over at a minute.
    expect(door.fail(180_000)).toBe(60_000);
  });

  test("says the wait in minutes and seconds", () => {
    expect(describeWait(45_000)).toBe("45 s");
    expect(describeWait(60_000)).toBe("1 min");
    expect(describeWait(200_000)).toBe("3 min 20 s");
    expect(describeWait(1)).toBe("1 s");
  });
});
