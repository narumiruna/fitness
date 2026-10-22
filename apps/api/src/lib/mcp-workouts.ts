import { createHash } from "node:crypto";
import {
  type McpToolErrorCode,
  type McpToolInput,
  type McpToolName,
  type McpToolOutput,
  mcpToolSchemas,
} from "@narumitw/fitness-contracts";
import {
  calculateMcpProgress,
  type McpStatsWorkout,
  summarizeMcpTraining,
} from "@narumitw/fitness-core";
import { formatDateKey, parseDateKey } from "@narumitw/fitness-core/calendar";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client.js";
import { normalizeExerciseAlias } from "./exercises.js";
import { prisma } from "./prisma.js";

/** Supplied only after bearer-token verification; never selected from arguments. */
export type McpPrincipal = {
  userId: string;
  clientId: string;
  scopes: string[];
  grantId?: string;
  signal?: AbortSignal;
};

export class McpToolError extends Error {
  constructor(public readonly code: McpToolErrorCode) {
    super(code);
    this.name = "McpToolError";
  }
}

const units = { weight: "kg", volume: "kg_reps" } as const;
const inclusionRules = {
  workouts: "COMPLETED",
  sets: "completed = true",
  totalVolume: "includes WARMUP and WORKING",
  workingMetrics: "WORKING only",
  estimatedOneRepMax: "Epley: weightKg * (1 + reps / 30); estimate",
  weekStartsOn: "Sunday",
} as const;
const analysisSetLimit = 50000;
const cursorSchema = z.strictObject({
  version: z.literal(1),
  binding: z.string().regex(/^[a-f0-9]{64}$/),
  id: z.string().min(1).max(128),
});
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

function cursorBinding(
  name: McpToolName,
  principal: McpPrincipal,
  query: unknown,
) {
  return hash([name, principal.userId, principal.clientId, query]);
}
function encodeCursor(binding: string, id: string) {
  return Buffer.from(JSON.stringify({ version: 1, binding, id })).toString(
    "base64url",
  );
}
function decodeCursor(raw: string | undefined, binding: string) {
  if (raw === undefined) return undefined;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error();
    const parsed = cursorSchema.parse(
      JSON.parse(Buffer.from(raw, "base64url").toString("utf8")),
    );
    if (parsed.binding !== binding) throw new Error();
    return parsed.id;
  } catch {
    throw new McpToolError("INVALID_CURSOR");
  }
}
// Cursors are not credentials or signatures. The digest binds normal use to a
// principal/query; every anchor and page also repeats the database owner filter.
function calendarDate(value: string) {
  const date = parseDateKey(value);
  if (!date) throw new McpToolError("INVALID_INPUT");
  return date;
}
function dateRange(input: { fromDate: string; toDateExclusive: string }) {
  return {
    gte: calendarDate(input.fromDate),
    lt: calendarDate(input.toDateExclusive),
  };
}
function boundedText(value: string | null, limit: number) {
  return value === null ? null : value.slice(0, limit);
}
function checkBudget(length: number) {
  if (length > analysisSetLimit) throw new McpToolError("RANGE_TOO_LARGE");
}

async function getContext(principal: McpPrincipal) {
  const user = await prisma.user.findUnique({
    where: { id: principal.userId },
    select: { username: true },
  });
  if (!user) throw new McpToolError("NOT_FOUND");
  return {
    displayName: user.username.slice(0, 64),
    scopes: principal.scopes,
    generatedAt: new Date().toISOString(),
    units,
    dateRules: {
      format: "YYYY-MM-DD",
      rangeStart: "inclusive",
      rangeEnd: "exclusive",
      timezone: "explicit local calendar date; no user timezone stored",
      weekStartsOn: "Sunday",
    },
    limits: {
      setsPerWorkout: 200,
      workoutPageSize: 50,
      exercisePageSize: 20,
      rangeDays: 366,
      analysisSets: analysisSetLimit,
    },
  };
}

async function searchExercises(
  principal: McpPrincipal,
  input: McpToolInput<"fitness_search_exercises">,
) {
  const { cursor, ...query } = input;
  const binding = cursorBinding("fitness_search_exercises", principal, query);
  const anchorId = decodeCursor(cursor, binding);
  const where: Prisma.ExerciseWhereInput = input.query
    ? {
        OR: [
          { defaultName: { contains: input.query } },
          {
            names: {
              some: { locale: input.locale, name: { contains: input.query } },
            },
          },
          {
            aliases: {
              some: {
                locale: input.locale,
                normalizedAlias: {
                  contains: normalizeExerciseAlias(input.query),
                },
              },
            },
          },
        ],
      }
    : {};
  const anchor = anchorId
    ? await prisma.exercise.findFirst({
        where: { AND: [where, { id: anchorId }] },
        select: { id: true, defaultName: true },
      })
    : null;
  if (anchorId && !anchor) throw new McpToolError("INVALID_CURSOR");
  const rows = await prisma.exercise.findMany({
    where: {
      AND: [
        where,
        ...(anchor
          ? [
              {
                OR: [
                  { defaultName: { gt: anchor.defaultName } },
                  { defaultName: anchor.defaultName, id: { gt: anchor.id } },
                ],
              },
            ]
          : []),
      ],
    },
    orderBy: [{ defaultName: "asc" }, { id: "asc" }],
    take: input.limit + 1,
    select: {
      id: true,
      slug: true,
      defaultName: true,
      names: {
        select: { locale: true, name: true, isPrimary: true },
        orderBy: [{ locale: "asc" }, { name: "asc" }],
        take: 50,
      },
      aliases: {
        select: { locale: true, alias: true },
        orderBy: [{ locale: "asc" }, { alias: "asc" }],
        take: 50,
      },
      muscles: {
        select: { muscle: true, role: true },
        orderBy: { muscle: "asc" },
      },
      equipment: {
        select: { equipment: true },
        orderBy: { equipment: "asc" },
      },
    },
  });
  const page = rows.slice(0, input.limit);
  return {
    exercises: page.map((exercise) => ({
      ...exercise,
      slug: exercise.slug.slice(0, 240),
      defaultName: exercise.defaultName.slice(0, 120),
      names: exercise.names.map((name) => ({
        locale: name.locale.slice(0, 12),
        name: name.name.slice(0, 120),
        isPrimary: name.isPrimary,
      })),
      aliases: exercise.aliases.map((alias) => ({
        locale: alias.locale.slice(0, 12),
        alias: alias.alias.slice(0, 120),
      })),
      muscles: exercise.muscles.map((muscle) => ({
        muscle: muscle.muscle.slice(0, 120),
        role: muscle.role.slice(0, 120),
      })),
      equipment: exercise.equipment.map((item) => item.equipment.slice(0, 120)),
    })),
    nextCursor:
      rows.length > input.limit
        ? encodeCursor(binding, page[page.length - 1].id)
        : null,
  };
}

async function listWorkouts(
  principal: McpPrincipal,
  input: McpToolInput<"fitness_list_workouts">,
) {
  const { cursor, ...query } = input;
  const binding = cursorBinding("fitness_list_workouts", principal, query);
  const anchorId = decodeCursor(cursor, binding);
  const where: Prisma.WorkoutWhereInput = {
    userId: principal.userId,
    state: "COMPLETED",
    date: dateRange(input),
    ...(input.exerciseId
      ? { sets: { some: { exerciseId: input.exerciseId, completed: true } } }
      : {}),
  };
  const anchor = anchorId
    ? await prisma.workout.findFirst({
        where: { AND: [where, { id: anchorId }] },
        select: { id: true, date: true },
      })
    : null;
  if (anchorId && !anchor) throw new McpToolError("INVALID_CURSOR");
  const rows = await prisma.workout.findMany({
    where: {
      AND: [
        where,
        ...(anchor
          ? [
              {
                OR: [
                  { date: { lt: anchor.date } },
                  { date: anchor.date, id: { lt: anchor.id } },
                ],
              },
            ]
          : []),
      ],
    },
    orderBy: [{ date: "desc" }, { id: "desc" }],
    take: input.limit + 1,
    select: { id: true, date: true, title: true, version: true },
  });
  const page = rows.slice(0, input.limit);
  const sets = await prisma.workoutSet.findMany({
    where: {
      completed: true,
      workoutId: { in: page.map((workout) => workout.id) },
      workout: { userId: principal.userId, state: "COMPLETED" },
    },
    select: { workoutId: true, weight: true, reps: true },
    take: analysisSetLimit + 1,
  });
  checkBudget(sets.length);
  const totals = new Map<
    string,
    { setCount: number; totalVolumeKgReps: number }
  >();
  for (const set of sets) {
    const total = totals.get(set.workoutId) ?? {
      setCount: 0,
      totalVolumeKgReps: 0,
    };
    total.setCount++;
    total.totalVolumeKgReps += set.weight * set.reps;
    totals.set(set.workoutId, total);
  }
  return {
    workouts: page.map((workout) => ({
      workoutId: workout.id,
      date: formatDateKey(workout.date),
      title: boundedText(workout.title, 120),
      version: workout.version,
      ...(totals.get(workout.id) ?? { setCount: 0, totalVolumeKgReps: 0 }),
    })),
    units,
    nextCursor:
      rows.length > input.limit
        ? encodeCursor(binding, page[page.length - 1].id)
        : null,
  };
}

async function getWorkout(
  principal: McpPrincipal,
  input: McpToolInput<"fitness_get_workout">,
) {
  const workout = await prisma.workout.findFirst({
    where: {
      id: input.workoutId,
      userId: principal.userId,
      state: "COMPLETED",
    },
    select: {
      id: true,
      date: true,
      title: true,
      notes: true,
      version: true,
      sets: {
        where: { completed: true },
        orderBy: [{ order: "asc" }, { id: "asc" }],
        take: 201,
        select: {
          id: true,
          exerciseId: true,
          order: true,
          weight: true,
          reps: true,
          type: true,
          rir: true,
          notes: true,
        },
      },
    },
  });
  if (!workout) throw new McpToolError("NOT_FOUND");
  if (workout.sets.length > 200) throw new McpToolError("RANGE_TOO_LARGE");
  return {
    workoutId: workout.id,
    date: formatDateKey(workout.date),
    title: boundedText(workout.title, 120),
    notes: boundedText(workout.notes, 2000),
    version: workout.version,
    units,
    sets: workout.sets.map((set) => ({
      setId: set.id,
      exerciseId: set.exerciseId,
      order: set.order,
      weightKg: set.weight,
      reps: set.reps,
      type: set.type,
      rir: set.rir,
      notes: boundedText(set.notes, 1000),
    })),
  };
}

async function analysisWorkouts(
  principal: McpPrincipal,
  input: { fromDate: string; toDateExclusive: string; exerciseId?: string },
): Promise<McpStatsWorkout[]> {
  const where = {
    userId: principal.userId,
    state: "COMPLETED",
    date: dateRange(input),
  };
  const sets = await prisma.workoutSet.findMany({
    where: {
      completed: true,
      workout: where,
      ...(input.exerciseId ? { exerciseId: input.exerciseId } : {}),
    },
    take: analysisSetLimit + 1,
    select: {
      id: true,
      workoutId: true,
      weight: true,
      reps: true,
      type: true,
      completed: true,
      workout: { select: { id: true, date: true, state: true } },
    },
    orderBy: { id: "asc" },
  });
  checkBudget(sets.length);
  // Summary counts completed workouts with no performed sets too. Progress is
  // specific to the requested exercise and does not include unrelated workouts.
  const workouts = input.exerciseId
    ? sets.map((set) => set.workout)
    : await prisma.workout.findMany({
        where,
        select: { id: true, date: true, state: true },
        take: analysisSetLimit + 1,
      });
  checkBudget(workouts.length);
  const grouped = new Map<string, McpStatsWorkout>();
  for (const workout of workouts) {
    grouped.set(workout.id, { ...workout, sets: [] });
  }
  for (const set of sets) grouped.get(set.workoutId)?.sets.push(set);
  return [...grouped.values()];
}

async function trainingSummary(
  principal: McpPrincipal,
  input: McpToolInput<"fitness_get_training_summary">,
) {
  const workouts = await analysisWorkouts(principal, input);
  return {
    ...input,
    generatedAt: new Date().toISOString(),
    units,
    inclusionRules,
    ...summarizeMcpTraining(workouts, input.fromDate, input.toDateExclusive),
  };
}
async function exerciseProgress(
  principal: McpPrincipal,
  input: McpToolInput<"fitness_get_exercise_progress">,
) {
  const exercise = await prisma.exercise.findUnique({
    where: { id: input.exerciseId },
    select: { id: true },
  });
  if (!exercise) throw new McpToolError("NOT_FOUND");
  const workouts = await analysisWorkouts(principal, input);
  return {
    ...input,
    generatedAt: new Date().toISOString(),
    units,
    inclusionRules,
    ...calculateMcpProgress(workouts, input.fromDate, input.toDateExclusive),
  };
}

async function recordWorkout(
  principal: McpPrincipal,
  input: McpToolInput<"fitness_record_workout">,
) {
  // Fixed key order and explicit nulls give semantically identical inputs the
  // same hash; operationId belongs to the receipt key, not the workout payload.
  const payload = {
    date: input.date,
    title: input.title || null,
    notes: input.notes || null,
    sets: input.sets.map((set) => ({
      exerciseId: set.exerciseId,
      weight: set.weightKg,
      reps: set.reps,
      type: set.type,
      rir: set.rir ?? null,
      notes: set.notes || null,
    })),
  };
  const payloadHash = hash(payload);
  const receiptKey = {
    userId: principal.userId,
    clientId: principal.clientId,
    toolName: "fitness_record_workout",
    operationId: input.operationId,
  };
  return prisma.$transaction(
    async (tx) => {
      // Locking the user row before reading the unique receipt serializes retries
      // in PostgreSQL and obtains SQLite's write lock before a duplicate lookup.
      await tx.user.update({
        where: { id: principal.userId },
        data: { updatedAt: new Date() },
      });
      if (principal.signal?.aborted)
        throw new McpToolError("REQUEST_CANCELLED");
      if (principal.grantId) {
        const grant = await tx.mcpGrant.findFirst({
          where: {
            id: principal.grantId,
            userId: principal.userId,
            clientId: principal.clientId,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          select: { scopes: true },
        });
        if (!grant?.scopes.split(" ").includes("fitness:write"))
          throw new McpToolError("INSUFFICIENT_SCOPE");
      }
      const receipt = await tx.mcpWriteReceipt.findUnique({
        where: { userId_clientId_toolName_operationId: receiptKey },
        select: { payloadHash: true, workoutId: true },
      });
      if (receipt) {
        if (receipt.payloadHash !== payloadHash)
          throw new McpToolError("IDEMPOTENCY_CONFLICT");
        if (!receipt.workoutId) throw new McpToolError("RESULT_REMOVED");
        const workout = await tx.workout.findFirst({
          where: { id: receipt.workoutId, userId: principal.userId },
          select: { id: true, date: true, version: true },
        });
        if (!workout) throw new McpToolError("RESULT_REMOVED");
        return {
          workoutId: workout.id,
          version: workout.version,
          date: formatDateKey(workout.date),
          units,
          savedSetCount: payload.sets.length,
          retry: true,
        };
      }
      const exerciseIds = [
        ...new Set(payload.sets.map((set) => set.exerciseId)),
      ];
      const exercises = await tx.exercise.count({
        where: { id: { in: exerciseIds } },
      });
      if (exercises !== exerciseIds.length) throw new McpToolError("NOT_FOUND");
      const workout = await tx.workout.create({
        data: {
          userId: principal.userId,
          date: calendarDate(payload.date),
          title: payload.title,
          notes: payload.notes,
          state: "COMPLETED",
          sets: {
            create: payload.sets.map((set, index) => ({
              ...set,
              order: index + 1,
              completed: true,
              actualsEntered: true,
            })),
          },
        },
        select: { id: true, date: true, version: true },
      });
      await tx.mcpWriteReceipt.create({
        data: { ...receiptKey, payloadHash, workoutId: workout.id },
      });
      if (principal.signal?.aborted)
        throw new McpToolError("REQUEST_CANCELLED");
      return {
        workoutId: workout.id,
        version: workout.version,
        date: formatDateKey(workout.date),
        units,
        savedSetCount: payload.sets.length,
        retry: false,
      };
    },
    { timeout: 10_000 },
  );
}

export async function callFitnessTool(
  name: McpToolName,
  principal: McpPrincipal,
  raw: unknown,
): Promise<McpToolOutput<McpToolName>> {
  if (!Object.hasOwn(mcpToolSchemas, name))
    throw new McpToolError("INVALID_INPUT");
  const schema = mcpToolSchemas[name];
  if (principal.signal?.aborted) throw new McpToolError("REQUEST_CANCELLED");
  if (!principal.scopes.includes(schema.scope))
    throw new McpToolError("INSUFFICIENT_SCOPE");
  const parsed = schema.inputSchema.safeParse(raw);
  if (!parsed.success) throw new McpToolError("INVALID_INPUT");
  // Each branch parses its concrete schema to retain strict input types without
  // assertions across the union of tool arguments.
  let result: unknown;
  switch (name) {
    case "fitness_get_context":
      result = await getContext(principal);
      break;
    case "fitness_search_exercises":
      result = await searchExercises(
        principal,
        mcpToolSchemas[name].inputSchema.parse(raw),
      );
      break;
    case "fitness_list_workouts":
      result = await listWorkouts(
        principal,
        mcpToolSchemas[name].inputSchema.parse(raw),
      );
      break;
    case "fitness_get_workout":
      result = await getWorkout(
        principal,
        mcpToolSchemas[name].inputSchema.parse(raw),
      );
      break;
    case "fitness_get_training_summary":
      result = await trainingSummary(
        principal,
        mcpToolSchemas[name].inputSchema.parse(raw),
      );
      break;
    case "fitness_get_exercise_progress":
      result = await exerciseProgress(
        principal,
        mcpToolSchemas[name].inputSchema.parse(raw),
      );
      break;
    case "fitness_record_workout":
      result = await recordWorkout(
        principal,
        mcpToolSchemas[name].inputSchema.parse(raw),
      );
      break;
  }
  return schema.outputSchema.parse(result);
}
