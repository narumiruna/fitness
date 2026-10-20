import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import * as core from "../dist/index.js";
import {
  addCalendarDays,
  equipment,
  muscleCounts,
  muscles,
  performedSet,
  performedWorkout,
} from "../dist/training.js";

test("all public exports load from built JavaScript without server dependencies", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.equal(manifest.private, true);
  assert.deepEqual(manifest.dependencies ?? {}, {});
  const rootExports = new Map(Object.entries(core));
  for (const [subpath, entry] of Object.entries(manifest.exports)) {
    assert.ok(entry.import.startsWith("./dist/"));
    assert.ok(entry.types.startsWith("./dist/"));
    await readFile(new URL(`../${entry.types}`, import.meta.url), "utf8");
    const exports = await import(
      `${manifest.name}${subpath === "." ? "" : subpath.slice(1)}`
    );
    assert.ok(Object.keys(exports).length > 0);
    for (const [name, value] of Object.entries(exports)) {
      assert.equal(rootExports.get(name), value);
    }
  }
  const sourceDirectory = new URL("../src/", import.meta.url);
  for (const filename of await readdir(sourceDirectory)) {
    const source = await readFile(new URL(filename, sourceDirectory), "utf8");
    for (const [, specifier] of source.matchAll(/from\s+["']([^"']+)["']/g)) {
      assert.match(specifier, /^\.\/.+\.js$/);
    }
  }
});

test("training constants and independent muscle rows retain their values", () => {
  assert.deepEqual(performedWorkout, { state: "COMPLETED" });
  assert.deepEqual(performedSet, { completed: true });
  assert.equal(muscles.length, 9);
  assert.equal(equipment.length, 7);
  const compound = {
    exercise: {
      muscles: [
        { muscle: "chest", role: "PRIMARY" },
        { muscle: "shoulders", role: "PRIMARY" },
        { muscle: "arms", role: "SECONDARY" },
      ],
    },
  };
  const rows = muscleCounts([
    compound,
    compound,
    { exercise: { muscles: [] } },
  ]);
  assert.deepEqual(rows.get("chest"), { primary: 2, secondary: 0 });
  assert.deepEqual(rows.get("shoulders"), { primary: 2, secondary: 0 });
  assert.deepEqual(rows.get("arms"), { primary: 0, secondary: 2 });
  assert.deepEqual(rows.get("unknown"), { primary: 1, secondary: 0 });
  assert.equal(muscleCounts([]).get("chest")?.primary, 0);
});

test("locale-specific labels do not change calculation keys or values", () => {
  const date = new Date(2026, 9, 12);
  assert.equal(
    core.formatMonthTitle(2026, 10, "zh-TW"),
    new Intl.DateTimeFormat("zh-TW", { month: "long", year: "numeric" }).format(
      date,
    ),
  );
  const workouts = [{ date, sets: [] }];
  const en = core.calculateStats(workouts, "all", date, "en");
  const zh = core.calculateStats(workouts, "all", date, "zh-TW");
  assert.deepEqual(zh.overview, en.overview);
  assert.deepEqual(
    zh.daily.map(({ key, value }) => ({ key, value })),
    en.daily.map(({ key, value }) => ({ key, value })),
  );
  assert.notEqual(zh.daily[0].label, en.daily[0].label);
  assert.notEqual(zh.weekly[0].label, en.weekly[0].label);
  assert.notEqual(zh.monthlyTrend[0].label, en.monthlyTrend[0].label);
});

test("calendar-day arithmetic preserves local dates and rejects invalid dates", () => {
  assert.equal(addCalendarDays("2024-02-28", 1), "2024-02-29");
  assert.equal(addCalendarDays("2026-03-08", 1), "2026-03-09");
  assert.equal(addCalendarDays("2026-11-01", 1), "2026-11-02");
  assert.equal(addCalendarDays("2026-12-31", 1), "2027-01-01");
  for (const value of ["invalid", "2026-02-30", "2026-13-01"]) {
    assert.throws(() => addCalendarDays(value, 1), /Invalid calendar date/);
  }
});
