import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDateKey } from "../dist/calendar.js";
import { calculateStats } from "../dist/stats-calculations.js";
import {
  consistency,
  evaluateProgression,
  historyBoundary,
  transition,
  weekKey,
} from "../dist/training.js";

const date = (key) => parseDateKey(key);
const set = {
  exerciseId: "exercise",
  weight: 100,
  reps: 5,
  order: 1,
  exercise: { defaultName: "Squat" },
  type: "WORKING",
  completed: true,
  targetWeight: 100,
  targetReps: 5,
};

test("Sunday-start consistency deduplicates training dates and excludes future dates", () => {
  const result = consistency(
    [
      date("2026-10-03"),
      date("2026-10-04"),
      date("2026-10-04"),
      date("2026-10-11"),
      date("2026-11-01"),
    ],
    date("2026-10-10"),
  );
  assert.equal(result.current, 2);
  assert.equal(result.longest, 2);
  assert.equal(result.recent.at(-1)?.days, 1);
  assert.equal(weekKey(date("2026-10-04")), "2026-10-04");
});

test("open empty week retains streak; a missed closed week breaks it", () => {
  assert.equal(
    consistency([date("2026-10-03")], date("2026-10-04")).current,
    1,
  );
  assert.equal(
    consistency([date("2026-10-03")], date("2026-10-11")).current,
    0,
  );
  assert.equal(consistency([], date("2026-10-11")).longest, 0);
});

test("consistency handles year transitions, leap day, corrections and deletion", () => {
  const r = consistency(
    [date("2023-12-31"), date("2024-01-07"), date("2024-02-29")],
    date("2024-03-01"),
    2024,
  );
  assert.equal(r.longest, 2);
  assert.equal(r.heatmap.length, 366);
  assert.equal(r.heatmap.find((v) => v.date === "2024-02-29")?.count, 1);
  assert.equal(
    consistency([date("2024-01-07")], date("2024-01-08")).longest,
    1,
  );
});

test("history boundaries exclude same-day and future sessions even for future targets", () => {
  const now = date("2026-10-11");
  assert.equal(
    historyBoundary(date("2026-10-01"), now).getTime(),
    date("2026-10-01").getTime(),
  );
  assert.equal(
    historyBoundary(date("2026-10-11"), now).getTime(),
    now.getTime(),
  );
  assert.equal(
    historyBoundary(date("2026-10-20"), now).getTime(),
    date("2026-10-12").getTime(),
  );
});

test("reports exclude all unfinished work, retain total volume and restrict working records", () => {
  const stats = calculateStats([
    {
      date: date("2026-10-10"),
      state: "ACTIVE",
      sets: [{ ...set, weight: 900 }],
    },
    { date: date("2026-10-10"), state: "PAUSED", sets: [set] },
    { date: date("2026-10-10"), state: "ABANDONED", sets: [set] },
    {
      date: date("2026-10-10"),
      state: "COMPLETED",
      sets: [
        set,
        { ...set, completed: false, weight: 1000 },
        { ...set, type: "WARMUP", weight: 200 },
      ],
    },
  ]);
  assert.equal(stats.overview.totalSets, 2);
  assert.equal(stats.overview.totalVolume, 1500);
  assert.equal(stats.workingVolume, 500);
  assert.equal(stats.allTimeRecords[0].maxWeight.value, 100);
  assert.equal(stats.overview.trainingDays, 1);
  assert.equal(
    calculateStats([{ date: new Date(), sets: [] }]).overview.trainingDays,
    0,
  );
});

test("session transition table rejects reopening and invalid transitions", () => {
  assert.equal(transition("ACTIVE", "pause"), "PAUSED");
  assert.equal(transition("PAUSED", "resume"), "ACTIVE");
  for (const state of ["ACTIVE", "PAUSED"]) {
    assert.equal(transition(state, "finish"), "COMPLETED");
    assert.equal(transition(state, "abandon"), "ABANDONED");
  }
  for (const state of ["COMPLETED", "ABANDONED"])
    for (const action of ["resume", "pause", "finish"])
      assert.throws(() => transition(state, action));
});

test("progression requires every identical prescribed working target", () => {
  const targets = [{ ...set }, { ...set, order: 2 }];
  const source = [{ ...set }, { ...set, order: 2 }];
  assert.deepEqual(evaluateProgression(source, targets, 2.5), {
    reason: "metTargets",
    weight: 102.5,
  });
  assert.equal(
    evaluateProgression(
      [...source, { ...set, type: "WARMUP", weight: 1000 }],
      targets,
      0.125,
    ).weight,
    100.125,
  );
  for (const delta of [
    { completed: false },
    { reps: 4 },
    { weight: 90 },
    { targetReps: 6 },
    { targetWeight: null },
    { order: 3 },
  ])
    assert.equal(
      evaluateProgression([{ ...set, ...delta }, source[1]], targets, 2.5)
        .weight,
      null,
    );
  assert.equal(evaluateProgression([], targets, 2.5).weight, null);
  assert.equal(evaluateProgression(source, targets, 0).weight, null);
  assert.equal(
    evaluateProgression(
      source.map((s) => ({ ...s, weight: 2000, targetWeight: 2000 })),
      targets.map((s) => ({ ...s, weight: 2000 })),
      2.5,
    ).reason,
    "weightLimit",
  );
  assert.equal(
    evaluateProgression(
      source,
      [targets[0], { ...targets[1], weight: 110 }],
      2.5,
    ).weight,
    null,
  );
});
