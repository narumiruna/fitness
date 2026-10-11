import "server-only";

import { getLocale } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { calculateStats, type StatsRange } from "@/lib/stats-calculations";

export type {
  ExercisePersonalRecords,
  ExerciseStats,
  MonthlyStats,
  PeriodStats,
  SetRecord,
  StatsOverview,
  UserStats,
} from "@/lib/stats-calculations";

export async function getUserStats(userId: string, range: StatsRange = "all") {
  const workouts = await prisma.workout.findMany({
    where: { userId, state: "COMPLETED" },
    include: {
      sets: { where: { completed: true }, include: { exercise: true } },
    },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
  return calculateStats(workouts, range, new Date(), await getLocale());
}
