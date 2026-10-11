import { formatDateKey } from "./calendar";

export type StatsOverview = {
  totalWorkouts: number;
  trainingDays: number;
  totalSets: number;
  totalReps: number;
  totalVolume: number;
  averageVolumePerWorkout: number;
};

export type PeriodStats = {
  workouts: number;
  sets: number;
  reps: number;
  volume: number;
};

export type MonthlyStats = {
  key: string;
  label: string;
  workouts: number;
  sets: number;
  reps: number;
  volume: number;
};

export type ExerciseStats = {
  exerciseId: string;
  exerciseName: string;
  sets: number;
  reps: number;
  volume: number;
};

export type ExercisePersonalRecords = {
  exerciseId: string;
  exerciseName: string;
  maxWeight: SetRecord;
  maxReps: SetRecord;
  maxVolume: SetRecord;
  estimatedOneRepMax: SetRecord;
};

export type SetRecord = {
  value: number;
  weight: number;
  reps: number;
  date: Date;
};

export type UserStats = {
  overview: StatsOverview;
  currentPeriod: PeriodStats;
  previousPeriod: PeriodStats;
  monthlyTrend: MonthlyStats[];
  exerciseLeaders: ExerciseStats[];
  personalRecords: ExercisePersonalRecords[];
};

export type WorkoutForStats = {
  date: Date;
  sets: {
    exerciseId: string;
    weight: number;
    reps: number;
    exercise: { defaultName: string };
  }[];
};
type WorkoutSetForStats = WorkoutForStats["sets"][number];
const recentPeriodDays = 30;
const monthlyTrendMonths = 6;
const exerciseLeaderLimit = 8;

export type StatsRange = "all" | "30" | "90" | "180";
export function resolveStatsRange(value: string | undefined): StatsRange {
  return value === "30" || value === "90" || value === "180" ? value : "all";
}
export function rangeStart(range: StatsRange, now = new Date()) {
  return range === "all"
    ? undefined
    : addDays(startOfDay(now), -(Number(range) - 1));
}
export function calculateStats(
  workouts: WorkoutForStats[],
  range: StatsRange = "all",
  now = new Date(),
) {
  const start = rangeStart(range, now);
  const end = addDays(startOfDay(now), 1);
  // All time preserves every recorded date, including future-dated records.
  const selected = workouts.filter(
    (w) => range === "all" || (!!start && w.date >= start && w.date < end),
  );
  const firstDate = selected.reduce(
    (date, w) => (w.date < date ? w.date : date),
    start ?? selected[0]?.date ?? startOfDay(now),
  );
  const lastDate = selected.reduce(
    (date, w) => (w.date >= date ? addDays(startOfDay(w.date), 1) : date),
    end,
  );
  const sets = selected.flatMap((w) =>
    w.sets.map((s) => ({ ...s, workoutDate: w.date })),
  );
  const allSets = workouts.flatMap((w) =>
    w.sets.map((s) => ({ ...s, workoutDate: w.date })),
  );
  return {
    overview: buildOverview(selected, sets),
    ...buildRecentPeriods(workouts, now),
    monthlyTrend: buildMonthlyTrend(selected, now),
    exerciseLeaders: buildExerciseLeaders(sets),
    personalRecords: buildPersonalRecords(sets),
    allTimeRecords: buildPersonalRecords(allSets),
    daily: buildDaily(selected),
    weekly: buildWeekly(selected, firstDate, lastDate),
    distribution: buildDistribution(sets),
  };
}
export type DashboardStats = ReturnType<typeof calculateStats>;

function buildDaily(workouts: WorkoutForStats[]) {
  const days = new Map<string, number>();
  for (const w of workouts) {
    const key = formatDateKey(w.date);
    days.set(key, (days.get(key) ?? 0) + sumVolume(w.sets));
  }
  return [...days]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({
      key,
      label: new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
      }).format(new Date(`${key}T00:00:00`)),
      value,
    }));
}
function buildWeekly(workouts: WorkoutForStats[], start: Date, end: Date) {
  const first = addDays(startOfDay(start), -start.getDay());
  const weeks = new Map<string, number>();
  for (let date = first; date < end; date = addDays(date, 7))
    weeks.set(formatDateKey(date), 0);
  for (const w of workouts) {
    const key = formatDateKey(addDays(startOfDay(w.date), -w.date.getDay()));
    weeks.set(key, (weeks.get(key) ?? 0) + 1);
  }
  return [...weeks].map(([key, value]) => ({
    key,
    label: new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(`${key}T00:00:00`)),
    value,
  }));
}
function buildDistribution(
  sets: Array<WorkoutSetForStats & { workoutDate: Date }>,
) {
  const counts = new Map<
    string,
    { key: string; label: string; value: number }
  >();
  for (const s of sets) {
    const item = counts.get(s.exerciseId) ?? {
      key: s.exerciseId,
      label: s.exercise.defaultName,
      value: 0,
    };
    item.value++;
    counts.set(s.exerciseId, item);
  }
  const items = [...counts.values()].sort(
    (a, b) => b.value - a.value || a.label.localeCompare(b.label),
  );
  return items.length > 6
    ? [
        ...items.slice(0, 6),
        {
          key: "other",
          label: "",
          value: items.slice(6).reduce((n, s) => n + s.value, 0),
        },
      ]
    : items;
}

function buildOverview(
  workouts: WorkoutForStats[],
  sets: Array<WorkoutSetForStats & { workoutDate: Date }>,
): StatsOverview {
  const trainingDays = new Set(
    workouts.map((workout) => formatDateKey(workout.date)),
  );
  const totalVolume = sumVolume(sets);

  return {
    totalWorkouts: workouts.length,
    trainingDays: trainingDays.size,
    totalSets: sets.length,
    totalReps: sets.reduce((total, set) => total + set.reps, 0),
    totalVolume,
    averageVolumePerWorkout:
      workouts.length > 0 ? totalVolume / workouts.length : 0,
  };
}

function buildRecentPeriods(workouts: WorkoutForStats[], now: Date) {
  const today = startOfDay(now);
  const currentStart = addDays(today, -(recentPeriodDays - 1));
  const nextDay = addDays(today, 1);
  const previousStart = addDays(currentStart, -recentPeriodDays);

  return {
    currentPeriod: summarizeWorkoutsInRange(workouts, currentStart, nextDay),
    previousPeriod: summarizeWorkoutsInRange(
      workouts,
      previousStart,
      currentStart,
    ),
  };
}

function buildMonthlyTrend(
  workouts: WorkoutForStats[],
  now: Date,
): MonthlyStats[] {
  const firstMonth = new Date(
    now.getFullYear(),
    now.getMonth() - (monthlyTrendMonths - 1),
    1,
  );
  const months = Array.from({ length: monthlyTrendMonths }, (_, index) => {
    const date = new Date(
      firstMonth.getFullYear(),
      firstMonth.getMonth() + index,
      1,
    );
    const key = formatMonthKey(date);

    return {
      key,
      label: new Intl.DateTimeFormat("en", {
        month: "short",
        year: "numeric",
      }).format(date),
      workouts: 0,
      sets: 0,
      reps: 0,
      volume: 0,
    };
  });
  const monthByKey = new Map(months.map((month) => [month.key, month]));

  for (const workout of workouts) {
    const month = monthByKey.get(formatMonthKey(workout.date));

    if (!month) {
      continue;
    }

    month.workouts += 1;
    month.sets += workout.sets.length;
    month.reps += workout.sets.reduce((total, set) => total + set.reps, 0);
    month.volume += sumVolume(workout.sets);
  }

  return months;
}

function buildExerciseLeaders(
  sets: Array<WorkoutSetForStats & { workoutDate: Date }>,
): ExerciseStats[] {
  const statsByExercise = new Map<string, ExerciseStats>();

  for (const set of sets) {
    const existing = statsByExercise.get(set.exerciseId) ?? {
      exerciseId: set.exerciseId,
      exerciseName: set.exercise.defaultName,
      sets: 0,
      reps: 0,
      volume: 0,
    };

    existing.sets += 1;
    existing.reps += set.reps;
    existing.volume += setVolume(set);
    statsByExercise.set(set.exerciseId, existing);
  }

  return [...statsByExercise.values()]
    .sort(
      (left, right) =>
        right.volume - left.volume ||
        right.sets - left.sets ||
        left.exerciseName.localeCompare(right.exerciseName),
    )
    .slice(0, exerciseLeaderLimit);
}

function buildPersonalRecords(
  sets: Array<WorkoutSetForStats & { workoutDate: Date }>,
): ExercisePersonalRecords[] {
  const recordsByExercise = new Map<string, ExercisePersonalRecords>();

  for (const set of sets) {
    const record = toRecord(set, set.weight);
    const repsRecord = toRecord(set, set.reps);
    const volumeRecord = toRecord(set, setVolume(set));
    const estimatedOneRepMaxRecord = toRecord(set, estimatedOneRepMax(set));
    const existing = recordsByExercise.get(set.exerciseId);

    if (!existing) {
      recordsByExercise.set(set.exerciseId, {
        exerciseId: set.exerciseId,
        exerciseName: set.exercise.defaultName,
        maxWeight: record,
        maxReps: repsRecord,
        maxVolume: volumeRecord,
        estimatedOneRepMax: estimatedOneRepMaxRecord,
      });
      continue;
    }

    existing.maxWeight = betterRecord(existing.maxWeight, record);
    existing.maxReps = betterRecord(existing.maxReps, repsRecord);
    existing.maxVolume = betterRecord(existing.maxVolume, volumeRecord);
    existing.estimatedOneRepMax = betterRecord(
      existing.estimatedOneRepMax,
      estimatedOneRepMaxRecord,
    );
  }

  return [...recordsByExercise.values()].sort((left, right) =>
    left.exerciseName.localeCompare(right.exerciseName),
  );
}

function summarizeWorkoutsInRange(
  workouts: WorkoutForStats[],
  startDate: Date,
  endDate: Date,
): PeriodStats {
  const periodWorkouts = workouts.filter(
    (workout) => workout.date >= startDate && workout.date < endDate,
  );
  const sets = periodWorkouts.flatMap((workout) => workout.sets);

  return {
    workouts: periodWorkouts.length,
    sets: sets.length,
    reps: sets.reduce((total, set) => total + set.reps, 0),
    volume: sumVolume(sets),
  };
}

function betterRecord(current: SetRecord, candidate: SetRecord) {
  if (candidate.value !== current.value) {
    return candidate.value > current.value ? candidate : current;
  }

  if (candidate.weight !== current.weight) {
    return candidate.weight > current.weight ? candidate : current;
  }

  if (candidate.reps !== current.reps) {
    return candidate.reps > current.reps ? candidate : current;
  }

  return candidate.date > current.date ? candidate : current;
}

function toRecord(
  set: WorkoutSetForStats & { workoutDate: Date },
  value: number,
): SetRecord {
  return {
    value,
    weight: set.weight,
    reps: set.reps,
    date: set.workoutDate,
  };
}

function estimatedOneRepMax(set: Pick<WorkoutSetForStats, "weight" | "reps">) {
  return set.weight * (1 + set.reps / 30);
}

function setVolume(set: Pick<WorkoutSetForStats, "weight" | "reps">) {
  return set.weight * set.reps;
}

export function sumVolume(sets: Pick<WorkoutSetForStats, "weight" | "reps">[]) {
  return sets.reduce((total, set) => total + setVolume(set), 0);
}

function formatMonthKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}`;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}
