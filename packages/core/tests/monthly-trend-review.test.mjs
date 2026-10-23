import assert from "node:assert/strict";
import test from "node:test";
import { buildExerciseMonthlyTrend } from "@narumitw/fitness-core/calendar";

for (const [today, keys] of [
  [
    new Date(2026, 4, 31, 12),
    ["2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05"],
  ],
  [
    new Date(2024, 2, 31, 12),
    ["2023-10", "2023-11", "2023-12", "2024-01", "2024-02", "2024-03"],
  ],
  [
    new Date(2024, 1, 29, 12),
    ["2023-09", "2023-10", "2023-11", "2023-12", "2024-01", "2024-02"],
  ],
  [
    new Date(2026, 0, 31, 12),
    ["2025-08", "2025-09", "2025-10", "2025-11", "2025-12", "2026-01"],
  ],
]) {
  test(`exercise trend has six distinct consecutive months at ${today.toDateString()}`, () => {
    const original = today.getTime();
    const trend = buildExerciseMonthlyTrend([], "en", today);
    assert.deepEqual(
      trend.map((month) => month.key),
      keys,
    );
    assert.equal(new Set(trend.map((month) => month.key)).size, 6);
    assert.ok(trend.every((month) => month.volume === 0));
    assert.equal(today.getTime(), original);
  });
}

test("exercise trend counts each month's volume once, including leap day and all set types", () => {
  const sets = [
    { date: "2023-09-30", weight: 1000, reps: 10, type: "WORKING" },
    { date: "2023-10-01", weight: 20, reps: 5, type: "WORKING" },
    { date: "2023-11-30", weight: 12.5, reps: 3, type: "WORKING" },
    { date: "2024-01-31", weight: 10, reps: 2, type: "WARMUP" },
    { date: "2024-02-01", weight: 20, reps: 4, type: "WORKING" },
    { date: "2024-02-29", weight: 22.5, reps: 2, type: "WORKING" },
    { date: "2024-02-29", weight: 10, reps: 3, type: "WARMUP" },
    { date: "2024-03-01", weight: 0, reps: 10, type: "WORKING" },
    { date: "2024-03-31", weight: 30, reps: 3, type: "WORKING" },
    { date: "2024-04-01", weight: 1000, reps: 10, type: "WORKING" },
  ].map(({ date, ...set }) => ({
    ...set,
    workout: { date: new Date(`${date}T00:00:00`) },
  }));
  const trend = buildExerciseMonthlyTrend(sets, "en", new Date(2024, 2, 31));
  assert.deepEqual(
    trend.map(({ key, label, volume }) => [key, label, volume]),
    [
      ["2023-10", "Oct", 100],
      ["2023-11", "Nov", 37.5],
      ["2023-12", "Dec", 0],
      ["2024-01", "Jan", 20],
      ["2024-02", "Feb", 155],
      ["2024-03", "Mar", 90],
    ],
  );
  assert.equal(
    trend.reduce((total, month) => total + month.volume, 0),
    402.5,
  );
  const localized = buildExerciseMonthlyTrend(
    sets,
    "zh-TW",
    new Date(2024, 2, 31),
  );
  assert.deepEqual(
    localized.map(({ key, volume }) => [key, volume]),
    trend.map(({ key, volume }) => [key, volume]),
  );
});
