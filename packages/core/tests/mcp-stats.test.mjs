import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import {
  calculateMcpProgress,
  summarizeMcpTraining,
} from "../dist/mcp-stats.js";
import { calculateStats } from "../dist/stats-calculations.js";

const fromDate = "2026-01-31";
const toDateExclusive = "2026-02-02";
const set = (id, weight, reps, type = "WORKING", completed = true) => ({
  id,
  weight,
  reps,
  type,
  completed,
});
const workout = (id, date, sets, state = "COMPLETED") => ({
  id,
  date: new Date(`${date}T00:00:00`),
  sets,
  state,
});
const fixtures = [
  workout("old", "2026-01-30", [set("old-set", 1000, 10)]),
  workout("a", "2026-01-31", [
    set("warm", 100, 20, "WARMUP"),
    set("a1", 60, 5),
    set("a2", 50, 10),
    set("incomplete", 900, 10, "WORKING", false),
  ]),
  workout("b", "2026-01-31", [set("b1", 40, 5)]),
  workout("empty", "2026-02-01", []),
  workout("c", "2026-02-01", [set("c1", 62.5, 3)]),
  workout("paused", "2026-02-01", [set("paused-set", 2000, 10)], "PAUSED"),
  workout("future", "2026-02-02", [set("future-set", 2000, 10)]),
];

test("bounded summary counts workouts and performed training days separately and includes warm-up volume", () => {
  const result = summarizeMcpTraining(fixtures, fromDate, toDateExclusive);
  assert.deepEqual(
    { ...result, weekly: undefined },
    {
      workoutCount: 4,
      trainingDayCount: 2,
      setCount: 5,
      workingSetCount: 4,
      reps: 43,
      totalVolumeKgReps: 3187.5,
      workingVolumeKgReps: 1187.5,
      weekly: undefined,
    },
  );
  assert.deepEqual(
    result.weekly.map((week) => [
      week.weekStartDate,
      week.workoutCount,
      week.totalVolumeKgReps,
    ]),
    [
      ["2026-01-25", 2, 3000],
      ["2026-02-01", 2, 187.5],
    ],
  );
  const core = calculateStats(
    fixtures
      .filter(
        (w) => w.id === "a" || w.id === "b" || w.id === "empty" || w.id === "c",
      )
      .map((w) => ({
        ...w,
        sets: w.sets.map((s) => ({
          ...s,
          exerciseId: "bench",
          exercise: { defaultName: "Bench" },
        })),
      })),
  );
  assert.equal(result.totalVolumeKgReps, core.overview.totalVolume);
  assert.equal(result.workingVolumeKgReps, core.workingVolume);
  assert.equal(result.trainingDayCount, core.overview.trainingDays);
});

test("exercise progress uses working sets and Epley estimates with exact source IDs", () => {
  const result = calculateMcpProgress(fixtures, fromDate, toDateExclusive);
  assert.equal(result.workoutCount, 3);
  assert.equal(result.trainingDayCount, 2);
  assert.equal(result.workingVolumeKgReps, 1187.5);
  assert.deepEqual(result.maxWeight, {
    setId: "c1",
    workoutId: "c",
    date: "2026-02-01",
    weightKg: 62.5,
    reps: 3,
    value: 62.5,
  });
  assert.deepEqual(result.estimatedOneRepMax, {
    setId: "a1",
    workoutId: "a",
    date: "2026-01-31",
    weightKg: 60,
    reps: 5,
    value: 70,
  });
  assert.deepEqual(
    result.workouts.map((point) => [
      point.workoutId,
      point.workingSetCount,
      point.workingReps,
      point.workingVolumeKgReps,
    ]),
    [
      ["a", 2, 15, 800],
      ["b", 1, 5, 200],
      ["c", 1, 3, 187.5],
    ],
  );
  assert.equal(result.workouts[0].estimatedOneRepMax.setId, "a1");
});

test("empty and warm-up-only data have null records, not evidence of zero performance", () => {
  const empty = calculateMcpProgress([], fromDate, toDateExclusive);
  assert.equal(empty.maxWeight, null);
  assert.equal(empty.estimatedOneRepMax, null);
  assert.deepEqual(empty.workouts, []);
  const warmup = calculateMcpProgress(
    [workout("w", fromDate, [set("s", 100, 10, "WARMUP")])],
    fromDate,
    toDateExclusive,
  );
  assert.equal(warmup.maxWeight, null);
  assert.equal(warmup.estimatedOneRepMax, null);
  assert.equal(warmup.workingSetCount, 0);
  assert.equal(warmup.totalVolumeKgReps, 1000);
  assert.equal(warmup.workouts[0].maxWeight, null);
  const zero = calculateMcpProgress(
    [workout("w", fromDate, [set("s", 0, 5)])],
    fromDate,
    toDateExclusive,
  );
  assert.equal(zero.maxWeight.value, 0);
  assert.equal(zero.maxWeight.setId, "s");
});

test("record ties are deterministic and do not depend on query result order", () => {
  const input = [
    workout("a", "2026-01-31", [set("a", 60, 5), set("b", 60, 5)]),
    workout("b", "2026-02-01", [set("c", 60, 5)]),
  ];
  const first = calculateMcpProgress(input, fromDate, toDateExclusive);
  const second = calculateMcpProgress(
    [...input].reverse(),
    fromDate,
    toDateExclusive,
  );
  assert.deepEqual(first, second);
  assert.equal(first.maxWeight.setId, "c");
  assert.equal(first.workouts[0].maxWeight.setId, "b");
});

test("weekly buckets include empty weeks and use the requested boundaries, not server now", () => {
  const result = summarizeMcpTraining([], "2026-01-31", "2026-02-16");
  assert.deepEqual(
    result.weekly.map((week) => week.weekStartDate),
    ["2026-01-25", "2026-02-01", "2026-02-08", "2026-02-15"],
  );
  assert.ok(result.weekly.every((week) => week.workoutCount === 0));
  assert.equal(
    summarizeMcpTraining([], "1900-01-01", "1900-01-02").weekly[0]
      .weekStartDate,
    "1899-12-31",
  );
});

test("explicit dates, month boundaries, Sunday weeks, and DST use local calendars under UTC and Asia/Taipei", () => {
  const script = `
    import assert from 'node:assert/strict';
    import { formatDateKey, parseDateKey } from './packages/core/dist/calendar.js';
    import { summarizeMcpTraining, calculateMcpProgress } from './packages/core/dist/mcp-stats.js';
    const records = ['2026-01-31', '2026-02-01', '2026-03-08', '2026-03-15'].map((date, i) => ({
      id: String(i), date: parseDateKey(date), state: 'COMPLETED',
      sets: [{ id: 'set-' + i, completed: true, type: 'WORKING', weight: 60, reps: 5 }]
    }));
    assert.equal(formatDateKey(records[0].date), '2026-01-31');
    const summary = summarizeMcpTraining(records, '2026-01-31', '2026-03-16');
    const progress = calculateMcpProgress(records, '2026-01-31', '2026-03-16');
    assert.equal(summary.weekly.find(w => w.weekStartDate === '2026-03-08').workoutCount, 1);
    assert.equal(summary.weekly.find(w => w.weekStartDate === '2026-03-15').workoutCount, 1);
    process.stdout.write(JSON.stringify({summary, progress}));
  `;
  const outputs = ["UTC", "Asia/Taipei", "America/New_York"].map((TZ) =>
    execFileSync(process.execPath, ["--input-type=module", "-e", script], {
      cwd: new URL("../../../", import.meta.url),
      env: { ...process.env, TZ },
      encoding: "utf8",
    }),
  );
  assert.equal(outputs[0], outputs[1]);
  assert.equal(outputs[0], outputs[2]);
});
