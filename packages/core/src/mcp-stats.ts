import { formatDateKey, parseDateKey } from "./calendar.js";
import { sumVolume } from "./stats-calculations.js";

export type McpStatsSet = {
  id: string;
  weight: number;
  reps: number;
  type: string;
  completed: boolean;
};
export type McpStatsWorkout = {
  id: string;
  date: Date;
  state: string;
  sets: McpStatsSet[];
};
type SourceRecord = {
  setId: string;
  workoutId: string;
  date: string;
  weightKg: number;
  reps: number;
  value: number;
};

function selectedWorkouts(
  workouts: McpStatsWorkout[],
  fromDate: string,
  toDateExclusive: string,
) {
  return workouts
    .filter((workout) => {
      const date = formatDateKey(workout.date);
      return (
        workout.state === "COMPLETED" &&
        date >= fromDate &&
        date < toDateExclusive
      );
    })
    .map((workout) => ({
      ...workout,
      sets: workout.sets.filter((set) => set.completed),
    }))
    .sort(
      (left, right) =>
        left.date.getTime() - right.date.getTime() ||
        left.id.localeCompare(right.id),
    );
}

function totals(workouts: McpStatsWorkout[]) {
  const sets = workouts.flatMap((workout) => workout.sets);
  const working = sets.filter((set) => set.type === "WORKING");
  return {
    workoutCount: workouts.length,
    trainingDayCount: new Set(
      workouts
        .filter((workout) => workout.sets.length > 0)
        .map((workout) => formatDateKey(workout.date)),
    ).size,
    setCount: sets.length,
    workingSetCount: working.length,
    reps: sets.reduce((total, set) => total + set.reps, 0),
    totalVolumeKgReps: sumVolume(sets),
    workingVolumeKgReps: sumVolume(working),
  };
}

function sunday(date: Date) {
  const result = new Date(date);
  result.setDate(result.getDate() - result.getDay());
  return result;
}

export function summarizeMcpTraining(
  workouts: McpStatsWorkout[],
  fromDate: string,
  toDateExclusive: string,
) {
  const selected = selectedWorkouts(workouts, fromDate, toDateExclusive);
  const start = parseDateKey(fromDate);
  const end = parseDateKey(toDateExclusive);
  if (!start || !end || start >= end) throw new RangeError("INVALID_RANGE");
  const buckets = new Map<string, McpStatsWorkout[]>();
  for (const day = sunday(start); day < end; day.setDate(day.getDate() + 7)) {
    buckets.set(formatDateKey(day), []);
  }
  for (const workout of selected) {
    buckets.get(formatDateKey(sunday(workout.date)))?.push(workout);
  }
  return {
    ...totals(selected),
    weekly: [...buckets].map(([weekStartDate, items]) => ({
      weekStartDate,
      ...totals(items),
    })),
  };
}

function bestRecord(records: SourceRecord[]): SourceRecord | null {
  return records.reduce<SourceRecord | null>((best, record) => {
    if (!best) return record;
    const difference =
      record.value - best.value ||
      record.weightKg - best.weightKg ||
      record.reps - best.reps ||
      record.date.localeCompare(best.date) ||
      record.workoutId.localeCompare(best.workoutId) ||
      record.setId.localeCompare(best.setId);
    return difference > 0 ? record : best;
  }, null);
}

export function calculateMcpProgress(
  workouts: McpStatsWorkout[],
  fromDate: string,
  toDateExclusive: string,
) {
  // The service selects only sets for the requested exercise before this call.
  const selected = selectedWorkouts(workouts, fromDate, toDateExclusive).filter(
    (workout) => workout.sets.length > 0,
  );
  const points = selected.map((workout) => {
    const working = workout.sets.filter((set) => set.type === "WORKING");
    const records = working.map((set) => ({
      setId: set.id,
      workoutId: workout.id,
      date: formatDateKey(workout.date),
      weightKg: set.weight,
      reps: set.reps,
      value: set.weight,
    }));
    return {
      workoutId: workout.id,
      date: formatDateKey(workout.date),
      workingSetCount: working.length,
      workingReps: working.reduce((total, set) => total + set.reps, 0),
      workingVolumeKgReps: sumVolume(working),
      maxWeight: bestRecord(records),
      estimatedOneRepMax: bestRecord(
        records.map((record) => ({
          ...record,
          value: record.weightKg * (1 + record.reps / 30),
        })),
      ),
    };
  });
  return {
    ...totals(selected),
    maxWeight: bestRecord(points.flatMap((point) => point.maxWeight ?? [])),
    estimatedOneRepMax: bestRecord(
      points.flatMap((point) => point.estimatedOneRepMax ?? []),
    ),
    workouts: points,
  };
}
