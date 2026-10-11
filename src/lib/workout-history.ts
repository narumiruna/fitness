import "server-only";
import { prisma } from "./prisma";
import { historyBoundary, performedSet, performedWorkout } from "./training";

export async function priorSessions(
  userId: string,
  workoutId: string,
  date: Date,
  exerciseIds: string[],
) {
  const boundary = historyBoundary(date);
  const workouts = await prisma.workout.findMany({
    where: {
      userId,
      ...performedWorkout,
      id: { not: workoutId },
      date: { lt: boundary },
      sets: { some: { ...performedSet, exerciseId: { in: exerciseIds } } },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    select: {
      date: true,
      sets: {
        where: { ...performedSet, exerciseId: { in: exerciseIds } },
        orderBy: [{ order: "asc" }, { id: "asc" }],
        select: { id: true, exerciseId: true, weight: true, reps: true },
      },
    },
  });
  const result: Record<
    string,
    { date: string; sets: { id: string; weight: number; reps: number }[] }
  > = {};
  for (const workout of workouts) {
    for (const exerciseId of new Set(workout.sets.map((s) => s.exerciseId))) {
      if (!result[exerciseId])
        result[exerciseId] = {
          date: workout.date.toLocaleDateString("en"),
          sets: workout.sets
            .filter((s) => s.exerciseId === exerciseId)
            .map(({ id, weight, reps }) => ({ id, weight, reps })),
        };
    }
  }
  return result;
}
