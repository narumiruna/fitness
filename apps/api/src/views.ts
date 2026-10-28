import { randomUUID } from "node:crypto";
import {
  buildCalendarMonth,
  formatDateKey,
  parseDateKey,
  resolveCalendarMonth,
} from "@narumitw/fitness-core/calendar";
import { resolveStatsRange } from "@narumitw/fitness-core/stats-calculations";
import { addCalendarDays, weekKey } from "@narumitw/fitness-core/training";
import { ApiError } from "./errors.js";
import type { Prisma } from "./generated/prisma/client.js";
import { requireAdmin, requireUser } from "./lib/auth.js";
import { normalizeExerciseAlias } from "./lib/exercises.js";
import { getLocale } from "./lib/i18n.js";
import { prisma } from "./lib/prisma.js";
import { suggestions } from "./lib/progression.js";
import { getUserStats } from "./lib/stats.js";
import { priorSessions } from "./lib/workout-history.js";

const withSets = {
  sets: { include: { exercise: true }, orderBy: { order: "asc" as const } },
};
async function planning(userId: string) {
  const [templates, schedules] = await Promise.all([
    prisma.workoutTemplate.findMany({
      where: { userId },
      include: { sets: { include: { exercise: true } }, rules: true },
    }),
    prisma.templateSchedule.findMany({ where: { userId, effectiveTo: null } }),
  ]);
  return { templates, schedules };
}
async function reports(userId: string) {
  const start = weekKey(new Date());
  const [consistencyHistory, muscleSets] = await Promise.all([
    prisma.workout.findMany({
      where: {
        userId,
        state: "COMPLETED",
        sets: { some: { completed: true } },
      },
      select: { date: true },
    }),
    prisma.workoutSet.findMany({
      where: {
        completed: true,
        type: "WORKING",
        workout: {
          userId,
          state: "COMPLETED",
          date: {
            gte: parseDateKey(start),
            lt: parseDateKey(addCalendarDays(start, 7)),
          },
        },
      },
      include: { exercise: { include: { muscles: true } } },
    }),
  ]);
  return { consistencyHistory, muscleSets };
}
async function calendarWorkouts(userId: string) {
  const today = new Date();
  const calendar = buildCalendarMonth(
    today.getFullYear(),
    today.getMonth() + 1,
    today,
  );
  return prisma.workout.findMany({
    where: {
      userId,
      state: "COMPLETED",
      date: { gte: calendar.startDate, lt: calendar.endDate },
    },
    select: { date: true },
    orderBy: { date: "asc" },
  });
}
async function readViewData(
  name: string,
  params: Record<string, string>,
  resourceId?: string,
): Promise<unknown> {
  const user = await requireUser();
  if (name === "new")
    return {
      key: randomUUID(),
      initialDate: formatDateKey(parseDateKey(params.date) ?? new Date()),
    };
  if (name === "workouts") {
    const page = Number(params.page);
    const filters = {
      exerciseId: params.exercise?.trim() ?? "",
      month:
        /^\d{4}-\d{2}$/.test(params.month ?? "") &&
        parseDateKey(`${params.month}-01`)
          ? params.month
          : "",
      notesOnly: params.notes === "1",
      page: Number.isSafeInteger(page) && page > 0 ? page : 1,
      q: params.q?.trim() ?? "",
    };
    const and: Prisma.WorkoutWhereInput[] = [];
    if (filters.q)
      and.push({
        OR: [
          { title: { contains: filters.q } },
          { notes: { contains: filters.q } },
        ],
      });
    if (filters.month) {
      const [y, m] = filters.month.split("-").map(Number);
      and.push({ date: { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) } });
    }
    if (filters.exerciseId)
      and.push({ sets: { some: { exerciseId: filters.exerciseId } } });
    if (filters.notesOnly)
      and.push({ notes: { not: null } }, { notes: { not: "" } });
    const where = { userId: user.id, ...(and.length ? { AND: and } : {}) };
    const now = new Date();
    const [
      filteredWorkoutCount,
      totalHistoryCount,
      totalWorkoutCount,
      workoutsThisMonth,
      totals,
    ] = await Promise.all([
      prisma.workout.count({ where }),
      prisma.workout.count({ where: { userId: user.id } }),
      prisma.workout.count({ where: { userId: user.id, state: "COMPLETED" } }),
      prisma.workout.count({
        where: {
          userId: user.id,
          state: "COMPLETED",
          date: {
            gte: new Date(now.getFullYear(), now.getMonth(), 1),
            lt: new Date(now.getFullYear(), now.getMonth() + 1, 1),
          },
        },
      }),
      prisma.$queryRaw<
        { count: bigint | number; volume: number }[]
      >`SELECT COUNT(*) AS count, COALESCE(SUM(s.weight * s.reps), 0) AS volume FROM "WorkoutSet" AS s JOIN "Workout" AS w ON w.id = s."workoutId" WHERE w."userId" = ${user.id} AND w.state = 'COMPLETED' AND s.completed = true`,
    ]);
    const totalPages = Math.max(1, Math.ceil(filteredWorkoutCount / 20));
    const currentPage = Math.min(filters.page, totalPages);
    const [
      workouts,
      ongoingSessions,
      exerciseOptions,
      templates,
      calendar,
      plans,
    ] = await Promise.all([
      prisma.workout.findMany({
        where,
        include: withSets,
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        skip: (currentPage - 1) * 20,
        take: 20,
      }),
      prisma.workout.findMany({
        where: { userId: user.id, state: { in: ["ACTIVE", "PAUSED"] } },
        select: {
          id: true,
          date: true,
          title: true,
          state: true,
          sets: { select: { completed: true } },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      }),
      prisma.exercise.findMany({
        where: { sets: { some: { workout: { userId: user.id } } } },
        orderBy: { defaultName: "asc" },
        select: { id: true, defaultName: true },
      }),
      prisma.workoutTemplate.findMany({
        where: { userId: user.id },
        include: { _count: { select: { sets: true } } },
        orderBy: { updatedAt: "desc" },
      }),
      calendarWorkouts(user.id),
      planning(user.id),
    ]);
    return {
      filteredWorkoutCount,
      totalHistoryCount,
      totalWorkoutCount,
      workoutsThisMonth,
      totals: totals.map((t) => ({
        count: Number(t.count),
        volume: Number(t.volume),
      })),
      totalPages,
      currentPage,
      workouts,
      ongoingSessions: ongoingSessions.map(({ sets, ...session }) => ({
        ...session,
        totalSets: sets.length,
        completedSets: sets.filter((set) => set.completed).length,
      })),
      exerciseOptions,
      templates,
      filters,
      today: formatDateKey(now),
      calendarWorkouts: calendar,
      planningTemplates: plans.templates,
      schedules: plans.schedules,
    };
  }
  if (name === "workout") {
    const workout = await prisma.workout.findFirst({
      where: { id: resourceId, userId: user.id },
      include: withSets,
    });
    if (!workout) throw new ApiError(404, "NOT_FOUND");
    const exercises = await prisma.exercise.findMany({
      orderBy: { defaultName: "asc" },
    });
    const [history, previews] = await Promise.all([
      priorSessions(
        user.id,
        workout.id,
        workout.date,
        exercises.map((e) => e.id),
        await getLocale(),
      ),
      suggestions(user.id, workout.id),
    ]);
    return { workout, exercises, history, previews };
  }
  if (name === "calendar") {
    const { year, month } = resolveCalendarMonth(params, new Date());
    const calendar = buildCalendarMonth(year, month, new Date());
    const [workouts, schedules, sessions] = await Promise.all([
      prisma.workout.findMany({
        where: {
          userId: user.id,
          date: { gte: calendar.startDate, lt: calendar.endDate },
        },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
        include: {
          sets: {
            where: { completed: true, workout: { state: "COMPLETED" } },
            include: { exercise: true },
            orderBy: { order: "asc" },
          },
        },
      }),
      prisma.templateSchedule.findMany({
        where: {
          userId: user.id,
          effectiveFrom: { lt: calendar.endDate },
          OR: [
            { effectiveTo: null },
            { effectiveTo: { gt: calendar.startDate } },
          ],
        },
      }),
      prisma.workout.findMany({
        where: {
          userId: user.id,
          plannedDate: { gte: calendar.startDate, lt: calendar.endDate },
        },
        include: {
          sets: {
            where: { completed: true },
            include: { exercise: true },
            orderBy: { order: "asc" },
          },
        },
      }),
    ]);
    return { workouts, schedules, sessions };
  }
  if (name === "stats")
    return {
      stats: await getUserStats(user.id, resolveStatsRange(params.range)),
      ...(await reports(user.id)),
    };
  if (name === "exercises") {
    const query = params.q?.trim() ?? "";
    const sort = params.sort === "desc" ? "desc" : "asc";
    const normalized = normalizeExerciseAlias(query);
    const [
      exercises,
      totalExerciseCount,
      totalAliasCount,
      usedExercises,
      muscleGroups,
    ] = await Promise.all([
      prisma.exercise.findMany({
        where: {
          ...(params.muscle && params.muscle !== "all"
            ? { muscles: { some: { muscle: params.muscle } } }
            : {}),
          ...(params.equipment && params.equipment !== "all"
            ? { equipment: { some: { equipment: params.equipment } } }
            : {}),
          ...(query
            ? {
                OR: [
                  { defaultName: { contains: query } },
                  { names: { some: { name: { contains: query } } } },
                  {
                    aliases: {
                      some: { normalizedAlias: { contains: normalized } },
                    },
                  },
                ],
              }
            : {}),
        },
        include: {
          aliases: { orderBy: [{ locale: "asc" }, { alias: "asc" }] },
          muscles: true,
          equipment: true,
        },
        orderBy: { defaultName: sort },
      }),
      prisma.exercise.count(),
      prisma.exerciseAlias.count(),
      prisma.$queryRaw<
        {
          exerciseId: string;
          name: string;
          date: Date | bigint | string | number;
          count: bigint | number;
        }[]
      >`SELECT s."exerciseId", e."defaultName" AS name, MAX(w.date) AS date, COUNT(*) AS count FROM "WorkoutSet" AS s JOIN "Workout" AS w ON w.id = s."workoutId" JOIN "Exercise" AS e ON e.id = s."exerciseId" WHERE w."userId" = ${user.id} AND w.state = 'COMPLETED' AND s.completed = true GROUP BY s."exerciseId", e."defaultName" ORDER BY MAX(w.date) DESC, e."defaultName" ASC, s."exerciseId" ASC`,
      prisma.exerciseMuscle.groupBy({
        by: ["muscle"],
        _count: true,
        orderBy: { muscle: "asc" },
      }),
    ]);
    const usage = usedExercises.map((e) => ({
      ...e,
      date:
        e.date instanceof Date
          ? e.date
          : new Date(typeof e.date === "bigint" ? Number(e.date) : e.date),
      count: Number(e.count),
    }));
    if (params.sort === "recent") {
      const dates = new Map(usage.map((e) => [e.exerciseId, e.date.getTime()]));
      exercises.sort(
        (a, b) =>
          (dates.get(b.id) ?? 0) - (dates.get(a.id) ?? 0) ||
          a.defaultName.localeCompare(b.defaultName),
      );
    }
    return {
      exercises,
      totalExerciseCount,
      totalAliasCount,
      usedExercises: usage,
      muscleGroups,
    };
  }
  if (name === "exercise") {
    const exercise = await prisma.exercise.findUnique({
      where: { id: resourceId },
      include: {
        aliases: { orderBy: [{ locale: "asc" }, { alias: "asc" }] },
        muscles: true,
        equipment: true,
      },
    });
    if (!exercise) throw new ApiError(404, "NOT_FOUND");
    const workouts = await prisma.workout.findMany({
      where: {
        userId: user.id,
        state: "COMPLETED",
        sets: { some: { exerciseId: resourceId, completed: true } },
      },
      include: {
        sets: {
          where: { exerciseId: resourceId, completed: true },
          orderBy: { order: "asc" },
        },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    return { exercise, workouts };
  }
  if (name === "measurements") {
    const [records, goal] = await Promise.all([
      prisma.bodyMeasurement.findMany({
        where: { userId: user.id },
        orderBy: { date: "asc" },
      }),
      prisma.bodyGoal.findUnique({ where: { userId: user.id } }),
    ]);
    return { records, goal };
  }
  if (name === "users") {
    await requireAdmin();
    return {
      users: await prisma.user.findMany({
        select: { id: true, username: true, role: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
    };
  }
  if (name === "passkeys")
    return {
      passkeys: await prisma.passkey.findMany({
        where: { userId: user.id },
        select: { id: true, name: true, createdAt: true, lastUsedAt: true },
        orderBy: { createdAt: "asc" },
      }),
    };
  if (name === "dashboard")
    return {
      calendarWorkouts: await calendarWorkouts(user.id),
      ...(await planning(user.id)),
      ...(await reports(user.id)),
    };
  if (name === "data")
    return {
      exercises: await prisma.exercise.findMany({
        orderBy: { defaultName: "asc" },
        select: { id: true, defaultName: true },
      }),
    };
  throw new ApiError(404, "NOT_FOUND");
}

export async function readView(
  name: string,
  params: Record<string, string>,
  resourceId?: string,
): Promise<unknown> {
  const today = formatDateKey(new Date());
  const data = await readViewData(name, params, resourceId);
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("Invalid page view");
  return { ...data, today };
}
