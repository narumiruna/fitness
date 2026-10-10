import "server-only";

import { formatDateKey } from "@/lib/calendar";
import { prisma } from "@/lib/prisma";

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

type WorkoutForStats = Awaited<ReturnType<typeof getWorkoutsForStats>>[number];
type WorkoutSetForStats = WorkoutForStats["sets"][number];

const recentPeriodDays = 30;
const monthlyTrendMonths = 6;
const exerciseLeaderLimit = 8;

export async function getUserStats(userId: string): Promise<UserStats> {
  const workouts = await getWorkoutsForStats(userId);
  const allSets = workouts.flatMap((workout) =>
    workout.sets.map((set) => ({ ...set, workoutDate: workout.date })),
  );

  return {
    overview: buildOverview(workouts, allSets),
    ...buildRecentPeriods(workouts),
    monthlyTrend: buildMonthlyTrend(workouts),
    exerciseLeaders: buildExerciseLeaders(allSets),
    personalRecords: buildPersonalRecords(allSets),
  };
}

async function getWorkoutsForStats(userId: string) {
  return prisma.workout.findMany({
    where: { userId },
    include: {
      sets: {
        include: {
          exercise: true,
        },
      },
    },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
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

function buildRecentPeriods(workouts: WorkoutForStats[]) {
  const today = startOfDay(new Date());
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

function buildMonthlyTrend(workouts: WorkoutForStats[]): MonthlyStats[] {
  const now = new Date();
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

function sumVolume(sets: Pick<WorkoutSetForStats, "weight" | "reps">[]) {
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
