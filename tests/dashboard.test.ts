import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CalendarError from "../src/app/calendar/error";
import ExercisesError from "../src/app/exercises/error";
import StatsError from "../src/app/stats/error";
import WorkoutsError from "../src/app/workouts/error";
import { PageErrorMessagesProvider } from "../src/components/page-error";
import {
  buildCalendarMonth,
  formatDateKey,
  parseDateKey,
  resolveCalendarMonth,
} from "../src/lib/calendar";
import {
  calculateStats,
  resolveStatsRange,
  type WorkoutForStats,
} from "../src/lib/stats-calculations";

test("all dashboard error boundaries use supplied localized messages", () => {
  for (const ErrorPage of [
    CalendarError,
    ExercisesError,
    StatsError,
    WorkoutsError,
  ]) {
    for (const messages of [
      { message: "Localized error text", retry: "Localized retry label" },
      { message: "This page could not be loaded.", retry: "Try again" },
    ]) {
      const html = renderToStaticMarkup(
        createElement(
          PageErrorMessagesProvider,
          messages,
          createElement(ErrorPage, { retry: () => {} }),
        ),
      );
      assert.ok(html.includes(messages.message));
      assert.ok(html.includes(messages.retry));
      assert.ok(html.includes('role="alert"'));
    }
  }
});

const now = new Date(2026, 9, 11, 12);
function workout(
  date: string,
  weight = 20,
  reps = 5,
  exerciseId = "bench",
): WorkoutForStats {
  return {
    date: new Date(`${date}T00:00:00`),
    sets: [{ exerciseId, weight, reps, exercise: { defaultName: exerciseId } }],
  };
}
test("calendar validates real local dates and handles leap/month/year boundaries", () => {
  assert.equal(parseDateKey("2026-02-29"), undefined);
  assert.equal(parseDateKey("2026-13-01"), undefined);
  assert.equal(parseDateKey("2026-01-00"), undefined);
  assert.equal(parseDateKey("invalid"), undefined);
  assert.equal(formatDateKey(parseDateKey("2024-02-29") as Date), "2024-02-29");
  for (const [year, month] of [
    [2024, 2],
    [2026, 10],
    [2026, 12],
    [2027, 1],
  ]) {
    const calendar = buildCalendarMonth(year, month, now);
    assert.equal(calendar.cells.length, 42);
    assert.equal(calendar.cells[0].date.getDay(), 0);
    assert.equal(calendar.cells[6].date.getDay(), 6);
    assert.equal(new Set(calendar.cells.map((c) => c.dateKey)).size, 42);
    assert.equal(
      calendar.cells.filter((c) => c.isCurrentMonth).length,
      new Date(year, month, 0).getDate(),
    );
  }
  assert.deepEqual(buildCalendarMonth(2026, 12, now).next, {
    year: 2027,
    month: 1,
  });
  assert.deepEqual(buildCalendarMonth(2027, 1, now).previous, {
    year: 2026,
    month: 12,
  });
  assert.deepEqual(resolveCalendarMonth({ year: "no", month: "99" }, now), {
    year: 2026,
    month: 10,
  });
});
test("ranges affect every interval metric; all-time records and 30-day comparisons remain explicit", () => {
  const stats = calculateStats(
    [
      workout("2026-08-01", 100, 5),
      workout("2026-09-20", 40, 5),
      workout("2026-10-11", 20, 4),
      workout("2026-10-12", 900, 5),
    ],
    "30",
    now,
  );
  assert.equal(stats.overview.totalWorkouts, 2);
  assert.equal(stats.overview.totalVolume, 280);
  assert.equal(stats.overview.totalReps, 9);
  assert.equal(stats.overview.totalSets, 2);
  assert.equal(stats.overview.trainingDays, 2);
  assert.equal(stats.overview.averageVolumePerWorkout, 140);
  assert.equal(stats.exerciseLeaders[0].volume, 280);
  assert.equal(stats.personalRecords[0].maxWeight.value, 40);
  assert.equal(stats.allTimeRecords[0].maxWeight.value, 900);
  assert.equal(stats.currentPeriod.volume, 280);
  assert.equal(
    stats.daily.reduce((n, p) => n + p.value, 0),
    280,
  );
  assert.equal(
    stats.monthlyTrend.reduce((n, p) => n + p.volume, 0),
    280,
  );
  assert.equal(
    stats.weekly.reduce((n, p) => n + p.value, 0),
    2,
  );
  assert.equal(
    stats.distribution.reduce((n, p) => n + p.value, 0),
    2,
  );
  const allTime = calculateStats(
    [workout("2026-10-11", 20, 4), workout("2026-10-12", 40, 5)],
    "all",
    now,
  );
  assert.equal(allTime.overview.totalWorkouts, 2);
  assert.equal(allTime.overview.totalVolume, 280);
  assert.equal(
    allTime.weekly.reduce((n, p) => n + p.value, 0),
    2,
  );
  assert.equal(
    allTime.daily.reduce((n, p) => n + p.value, 0),
    280,
  );
  assert.equal(resolveStatsRange("bogus"), "all");
  assert.equal(resolveStatsRange("90"), "90");
});
test("weekly buckets start Sunday, include empty weeks, and daily totals combine same-day sessions", () => {
  const stats = calculateStats(
    [
      workout("2026-09-13"),
      workout("2026-10-10"),
      workout("2026-10-11"),
      workout("2026-10-11", 0),
    ],
    "30",
    now,
  );
  assert.deepEqual(
    stats.daily.map((p) => [p.key, p.value]),
    [
      ["2026-09-13", 100],
      ["2026-10-10", 100],
      ["2026-10-11", 100],
    ],
  );
  assert.equal(stats.weekly.find((p) => p.key === "2026-10-04")?.value, 1);
  assert.equal(stats.weekly.find((p) => p.key === "2026-10-11")?.value, 2);
  assert.ok(stats.weekly.some((p) => p.value === 0));
  assert.ok(stats.weekly.every((p) => parseDateKey(p.key)?.getDay() === 0));
  assert.equal(stats.overview.trainingDays, 3);
});
test("distribution includes Other with no missing or double-counted sets", () => {
  const stats = calculateStats(
    Array.from({ length: 9 }, (_, i) =>
      workout("2026-10-11", 10, 5, `exercise-${i}`),
    ),
    "all",
    now,
  );
  assert.equal(stats.distribution.length, 7);
  assert.equal(stats.distribution.at(-1)?.key, "other");
  assert.equal(stats.distribution.at(-1)?.value, 3);
  assert.equal(
    stats.distribution.reduce((n, p) => n + p.value, 0),
    stats.overview.totalSets,
  );
});
test("empty, setless, single-session, zero-weight, fractional-weight, and record ties remain finite", () => {
  for (const workouts of [
    [],
    [{ date: now, sets: [] }],
    [workout("2026-10-11", 0)],
    [workout("2026-10-11", 12.5, 3)],
  ]) {
    const stats = calculateStats(workouts, "90", now);
    assert.ok(Object.values(stats.overview).every(Number.isFinite));
    assert.ok(stats.daily.every((p) => Number.isFinite(p.value)));
  }
  const stats = calculateStats(
    [workout("2026-10-10", 12.5, 3), workout("2026-10-11", 12.5, 3)],
    "all",
    now,
  );
  assert.equal(stats.personalRecords[0].maxVolume.value, 37.5);
  assert.ok(
    Math.abs(stats.personalRecords[0].estimatedOneRepMax.value - 13.75) < 1e-10,
  );
  assert.equal(
    formatDateKey(stats.personalRecords[0].maxWeight.date),
    "2026-10-11",
  );
});

test("weekly chart stays bounded across extreme dates without dropping recorded workouts", () => {
  for (const dates of [
    ["2026-10-11", "9999-12-31"],
    ["1900-01-01", "2026-10-11", "9999-12-31"],
    ["0000-01-01", "0050-01-01", "9999-12-31"],
  ]) {
    const stats = calculateStats(
      dates.map((date) => workout(date)),
      "all",
      now,
    );
    assert.ok(stats.weekly.length <= 52);
    assert.ok(stats.weeklyBucketWeeks > 1);
    assert.equal(
      stats.weekly.reduce((count, point) => count + point.value, 0),
      dates.length,
    );
    assert.equal(stats.overview.totalWorkouts, dates.length);
    assert.equal(stats.overview.totalVolume, dates.length * 100);
    assert.equal(
      stats.daily.reduce((volume, point) => volume + point.value, 0),
      dates.length * 100,
    );
    assert.ok(
      stats.weekly.every(
        (point) => new Date(`${point.key}T00:00:00`).getDay() === 0,
      ),
    );
    assert.ok(stats.weekly.some((point) => point.value === 0));
    assert.match(stats.weekly[0].label, / – /);
  }
  assert.equal(
    calculateStats([workout("9999-12-31")], "all", now).weekly.length,
    1,
  );
  for (const range of ["30", "90", "180"] as const) {
    const stats = calculateStats(
      [workout("1900-01-01"), workout("2026-10-11"), workout("9999-12-31")],
      range,
      now,
    );
    assert.equal(stats.weeklyBucketWeeks, 1);
    assert.equal(
      stats.weekly.reduce((count, point) => count + point.value, 0),
      1,
    );
  }
});

test("weekly period grouping preserves Sunday boundaries across daylight-saving changes", () => {
  const current = new Date("2026-11-08T12:00:00");
  const records = [
    workout("2025-10-01"),
    workout("2026-03-08"),
    workout("2026-03-15"),
    workout("2026-11-01"),
    workout("2026-11-08"),
  ];
  const stats = calculateStats(records, "all", current);
  assert.ok(stats.weeklyBucketWeeks > 1);
  assert.ok(stats.weekly.length <= 52);
  const first = new Date(`${stats.weekly[0].key}T00:00:00`);
  const counts = stats.weekly.map(() => 0);
  for (const record of records) {
    const date = new Date(first);
    let index = 0;
    while (true) {
      const next = new Date(date);
      next.setDate(next.getDate() + stats.weeklyBucketWeeks * 7);
      if (record.date < next) break;
      date.setTime(next.getTime());
      index++;
    }
    counts[index]++;
  }
  assert.deepEqual(
    stats.weekly.map((point) => point.value),
    counts,
  );
});
