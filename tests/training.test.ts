import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseWorkoutCsv,
  stringifyWorkoutCsv,
  type WorkoutCsvRow,
} from "../scripts/workout-csv";
import { parseDateKey } from "../src/lib/calendar";
import { calculateStats } from "../src/lib/stats-calculations";
import {
  consistency,
  evaluateProgression,
  historyBoundary,
  muscleCounts,
  transition,
  weekKey,
} from "../src/lib/training";
import {
  createSetSchema,
  goalSchema,
  measurementSchema,
  metadataSchema,
} from "../src/lib/validation";
import {
  csvColumns,
  csvLimit,
  occurrenceFingerprint,
  parseCsv,
  parseWorkouts,
  serializeWorkouts,
  type TransferWorkout,
  workoutFingerprint,
} from "../src/lib/workout-csv";

const date = (key: string) => parseDateKey(key) as Date;
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
const transfer: TransferWorkout = {
  key: "one",
  date: "2026-10-10",
  title: "=SUM(A1)",
  notes: 'comma,\nquote" and Unicode 🏋',
  state: "COMPLETED",
  activeSeconds: 90,
  templateTitle: "'routine",
  sets: [
    {
      order: 1,
      exercise: "Squat",
      weight: 100,
      reps: 5,
      notes: "+cmd",
      type: "WORKING",
      rir: 0.5,
      completed: true,
      targetWeight: 100,
      targetReps: 5,
    },
  ],
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
test("metadata rejects duplicate and invalid tags; muscle rows remain independent", () => {
  const input = {
    exerciseId: "one",
    primary: ["chest", "shoulders"],
    secondary: ["arms"],
    equipment: ["barbell"],
  };
  assert.ok(metadataSchema.safeParse(input).success);
  for (const invalid of [
    { ...input, primary: ["chest", "chest"] },
    { ...input, secondary: ["chest"] },
    { ...input, equipment: ["barbell", "barbell"] },
    { ...input, primary: ["invalid"] },
    { ...input, equipment: ["invalid"] },
  ])
    assert.equal(metadataSchema.safeParse(invalid).success, false);
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
test("legacy CSV helpers retain the separate local format", () => {
  const rows: WorkoutCsvRow[] = [
    {
      date: "2026-10-10",
      sourceFile: "fixture.md",
      rowType: "set",
      exerciseNameZh: "fixture",
      exerciseNameEn: "Squat",
      order: 1,
      weight: 42.5,
      reps: 7,
      note: "",
      rawLine: "Squat 42.5x7",
    },
    {
      date: "2026-10-10",
      sourceFile: "fixture.md",
      rowType: "note",
      exerciseNameZh: "",
      exerciseNameEn: "",
      order: "",
      weight: "",
      reps: "",
      note: 'comma, quote" and newline\n',
      rawLine: "note",
    },
  ];
  assert.deepEqual(parseWorkoutCsv(stringifyWorkoutCsv(rows)), rows);
});
test("RIR accepts blank, zero and half steps, and defaults legacy forms", () => {
  for (const rir of ["", null, undefined, 0, "0", "0.5", 10])
    assert.ok(createSetSchema.safeParse({ ...set, rir }).success);
  const legacy = createSetSchema.parse({
    ...set,
    type: undefined,
    rir: undefined,
  });
  assert.equal(legacy.type, "WORKING");
  assert.equal(legacy.rir, null);
  for (const rir of [-1, 10.5, 0.25, Infinity, NaN, "no"])
    assert.equal(createSetSchema.safeParse({ ...set, rir }).success, false);
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
test("measurements enforce finite positive metric bounds and at least one value", () => {
  for (const input of [
    { weight: 75, waist: "" },
    { weight: "", waist: 90 },
    { weight: 75, waist: 90 },
  ])
    assert.ok(
      measurementSchema.safeParse({ date: "2026-10-10", ...input }).success,
    );
  for (const input of [
    { weight: "", waist: "" },
    { weight: 0 },
    { weight: 501 },
    { waist: 301 },
    { weight: Infinity },
    { weight: "no" },
  ])
    assert.equal(
      measurementSchema.safeParse({ date: "2026-10-10", ...input }).success,
      false,
    );
  assert.equal(goalSchema.parse(""), null);
  assert.equal(goalSchema.parse("75"), 75);
});
test("CSV round trip preserves separate same-day sessions, ordered targets, states, notes and formula text", () => {
  for (const state of ["ACTIVE", "PAUSED", "COMPLETED", "ABANDONED"]) {
    const items = [
      { ...transfer, state },
      { ...transfer, key: "two", sets: [] },
      {
        ...transfer,
        key: "three",
        sets: [
          {
            ...transfer.sets[0],
            type: "WARMUP" as const,
            completed: false,
            rir: null,
            targetReps: null,
            targetWeight: null,
          },
        ],
      },
    ];
    const csv = serializeWorkouts(items);
    const result = parseWorkouts(`\uFEFF${csv}`);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.workouts, items);
    assert.ok(csv.includes("'="));
    assert.ok(csv.includes("'+cmd"));
    assert.ok(csv.includes("''routine"));
  }
});
test("CSV parser rejects malformed quoting, fields, numbers and limits", () => {
  for (const text of ['"open', 'a"b', '"a"b'])
    assert.throws(() => parseCsv(text));
  assert.throws(() => parseCsv("x".repeat(csvLimit + 1)));
  assert.throws(() => parseCsv("\n".repeat(20002)));
  assert.throws(() => parseWorkouts("wrong,header"));
  const valid = serializeWorkouts([transfer]);
  for (const [from, to] of [
    ['"100"', '"NaN"'],
    ['"0.5"', '"0.25"'],
    ['"2026-10-10"', '"2026-02-30"'],
    ['"WORKING"', '"DROP"'],
    ['"true"', '"yes"'],
    ["'=SUM(A1)", "=SUM(A1)"],
  ])
    assert.ok(parseWorkouts(valid.replace(from, to)).errors.length);
  assert.equal(parseCsv(`${csvColumns.join(",")}\r\n`).length, 1);
});
test("canonical fingerprints ignore export keys but distinguish content and sessions", () => {
  assert.equal(
    workoutFingerprint(transfer),
    workoutFingerprint({ ...transfer, key: "new" }),
  );
  assert.notEqual(
    workoutFingerprint(transfer),
    workoutFingerprint({ ...transfer, title: "other" }),
  );
  assert.notEqual(
    workoutFingerprint(transfer),
    workoutFingerprint({
      ...transfer,
      sets: [{ ...transfer.sets[0], completed: false }],
    }),
  );
  const counts = new Map<string, number>();
  assert.notEqual(
    occurrenceFingerprint(transfer, counts),
    occurrenceFingerprint({ ...transfer, key: "new" }, counts),
  );
  assert.equal(
    occurrenceFingerprint(transfer, new Map()),
    workoutFingerprint(transfer),
  );
  const emptyNotes = {
    ...transfer,
    notes: "",
    sets: [{ ...transfer.sets[0], notes: "", weight: 0.0000001 }],
  };
  assert.deepEqual(parseWorkouts(serializeWorkouts([emptyNotes])).workouts, [
    emptyNotes,
  ]);
});
