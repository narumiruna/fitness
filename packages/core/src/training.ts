import { formatDateKey, parseDateKey } from "./calendar.js";

export const performedWorkout = { state: "COMPLETED" } as const;
export const performedSet = { completed: true } as const;
export const muscles = [
  "chest",
  "back",
  "shoulders",
  "arms",
  "core",
  "quadriceps",
  "hamstrings",
  "glutes",
  "calves",
] as const;
export const equipment = [
  "barbell",
  "dumbbell",
  "machine",
  "cable",
  "bodyweight",
  "band",
  "other",
] as const;
export function muscleCounts(
  sets: { exercise: { muscles: { muscle: string; role: string }[] } }[],
) {
  const counts = new Map<string, { primary: number; secondary: number }>(
    [...muscles, "unknown"].map((muscle) => [
      muscle,
      { primary: 0, secondary: 0 },
    ]),
  );
  const unknown = counts.get("unknown");
  for (const set of sets) {
    if (
      unknown &&
      !set.exercise.muscles.some((muscle) => muscle.role === "PRIMARY")
    )
      unknown.primary++;
    for (const muscle of set.exercise.muscles) {
      const row = counts.get(muscle.muscle);
      if (row) {
        if (muscle.role === "PRIMARY") row.primary++;
        else if (muscle.role === "SECONDARY") row.secondary++;
      }
    }
  }
  return counts;
}
export type WorkoutState = "ACTIVE" | "PAUSED" | "COMPLETED" | "ABANDONED";
export function transition(state: string, action: string): WorkoutState {
  const transitions: Record<string, Record<string, WorkoutState>> = {
    ACTIVE: { pause: "PAUSED", finish: "COMPLETED", abandon: "ABANDONED" },
    PAUSED: { resume: "ACTIVE", finish: "COMPLETED", abandon: "ABANDONED" },
  };
  const next = transitions[state]?.[action];
  if (!next) throw new Error("Invalid session transition.");
  return next;
}
export function historyBoundary(date: Date, now = new Date()) {
  const tomorrow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  );
  return date < tomorrow ? date : tomorrow;
}
export function weekKey(date: Date) {
  return formatDateKey(
    new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate() - date.getDay(),
    ),
  );
}
export function addCalendarDays(key: string, days: number) {
  const date = new Date(`${key}T00:00:00`);
  if (!Number.isFinite(date.getTime()) || formatDateKey(date) !== key)
    throw new Error("Invalid calendar date.");
  date.setDate(date.getDate() + days);
  return formatDateKey(date);
}
export function consistency(
  dates: Date[],
  today = new Date(),
  year = today.getFullYear(),
) {
  const todayKey = formatDateKey(today);
  const days = new Set(
    dates.map(formatDateKey).filter((key) => key <= todayKey),
  );
  const weeks = new Set(
    [...days].map((key) => weekKey(parseDateKey(key) as Date)),
  );
  const currentWeek = weekKey(today);
  let cursor = weeks.has(currentWeek)
    ? currentWeek
    : addCalendarDays(currentWeek, -7);
  let current = 0;
  while (weeks.has(cursor)) {
    current++;
    cursor = addCalendarDays(cursor, -7);
  }
  let longest = 0;
  let run = 0;
  let previous = "";
  for (const key of [...weeks].sort()) {
    run = previous && addCalendarDays(previous, 7) === key ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = key;
  }
  const recent = Array.from({ length: 12 }, (_, i) => {
    const start = addCalendarDays(currentWeek, (i - 11) * 7);
    return {
      start,
      days: Array.from({ length: 7 }, (_, d) =>
        addCalendarDays(start, d),
      ).filter((key) => days.has(key)).length,
    };
  });
  const heatmap: { date: string; count: number }[] = [];
  for (
    let date = new Date(year, 0, 1);
    date.getFullYear() === year;
    date = new Date(year, date.getMonth(), date.getDate() + 1)
  ) {
    const key = formatDateKey(date);
    heatmap.push({ date: key, count: days.has(key) ? 1 : 0 });
  }
  return { current, longest, recent, heatmap };
}
export type ProgressionSet = {
  order: number;
  type: string;
  completed: boolean;
  weight: number;
  reps: number;
  targetWeight: number | null;
  targetReps: number | null;
};
export function evaluateProgression(
  source: ProgressionSet[],
  targets: { order: number; type: string; weight: number; reps: number }[],
  increment: number,
) {
  const planned = targets
    .filter((s) => s.type === "WORKING")
    .sort((a, b) => a.order - b.order);
  const actual = source
    .filter((s) => s.type === "WORKING")
    .sort((a, b) => a.order - b.order);
  if (!planned.length || actual.length !== planned.length)
    return { reason: "missingTargets", weight: null };
  if (!Number.isFinite(increment) || increment <= 0)
    return { reason: "disabled", weight: null };
  const weight = planned[0].weight;
  if (planned.some((s) => s.weight !== weight))
    return { reason: "inconsistentLoad", weight: null };
  for (let i = 0; i < planned.length; i++) {
    const a = actual[i];
    const p = planned[i];
    if (
      a.order !== p.order ||
      a.targetWeight !== p.weight ||
      a.targetReps !== p.reps
    )
      return { reason: "changedTargets", weight: null };
    if (!a.completed || a.weight !== p.weight || a.reps < p.reps)
      return { reason: "missedTargets", weight: null };
  }
  const next = Math.round((weight + increment) * 1000) / 1000;
  return next <= 2000
    ? { reason: "metTargets", weight: next }
    : { reason: "weightLimit", weight: null };
}
