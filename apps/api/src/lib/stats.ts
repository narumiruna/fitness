import {
  calculateStats,
  type StatsRange,
} from "@narumitw/fitness-core/stats-calculations";
import { getLocale } from "./i18n.js";
import { prisma } from "./prisma.js";

export type {
  ExercisePersonalRecords,
  ExerciseStats,
  MonthlyStats,
  PeriodStats,
  SetRecord,
  StatsOverview,
  UserStats,
} from "@narumitw/fitness-core/stats-calculations";

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
