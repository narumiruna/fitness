import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import {
  type McpToolErrorCode,
  type McpToolName,
  type McpToolOutput,
  mcpToolSchemas,
} from "@narumitw/fitness-contracts";
import { parseDateKey } from "@narumitw/fitness-core/calendar";
import {
  callFitnessTool,
  type McpPrincipal,
  McpToolError,
} from "../src/lib/mcp-workouts.js";
import { prisma } from "../src/lib/prisma.js";

assert.ok(process.env.DATABASE_URL, "Use the disposable API test runner");
const prefix = `mcp-workouts-${randomUUID()}`;
const range = { fromDate: "2026-10-03", toDateExclusive: "2026-10-07" };
const units = { weight: "kg", volume: "kg_reps" };
let principal: McpPrincipal;
let other: McpPrincipal;
let exerciseId: string;
let secondaryId: string;
const ids = {
  first: `${prefix}-a`,
  second: `${prefix}-b`,
  warmup: `${prefix}-c`,
  empty: `${prefix}-d`,
  draft: `${prefix}-draft`,
  other: `${prefix}-other`,
};

async function call<N extends McpToolName>(
  name: N,
  input: unknown,
  owner = principal,
): Promise<McpToolOutput<N>> {
  const result = await callFitnessTool(name, owner, input);
  return mcpToolSchemas[name].outputSchema.parse(result) as McpToolOutput<N>;
}

function rejects(code: McpToolErrorCode) {
  return (error: unknown) => {
    assert.ok(error instanceof McpToolError);
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    return true;
  };
}

function date(key: string) {
  const result = parseDateKey(key);
  assert.ok(result);
  return result;
}

function payload(operationId = randomUUID()) {
  return {
    operationId,
    date: "2026-10-31",
    title: " Completed training ",
    notes: " Workout notes ",
    sets: [
      { exerciseId, weightKg: 20, reps: 10, type: "WARMUP" },
      {
        exerciseId,
        weightKg: 60,
        reps: 5,
        type: "WORKING",
        rir: 1.5,
        notes: " Set notes ",
      },
    ],
  };
}

async function counts() {
  return Promise.all([
    prisma.workout.count({ where: { userId: principal.userId } }),
    prisma.workoutSet.count({
      where: { workout: { userId: principal.userId } },
    }),
    prisma.mcpWriteReceipt.count({ where: { userId: principal.userId } }),
  ]);
}

after(async () => {
  await prisma.user.deleteMany({ where: { username: { startsWith: prefix } } });
  await prisma.exercise.deleteMany({ where: { slug: { startsWith: prefix } } });
  await prisma.mcpClient.deleteMany({ where: { id: { startsWith: prefix } } });
  await prisma.$disconnect();
});

test("MCP workout services: projections, ownership, analysis and atomic retries", async (t) => {
  const user = await prisma.user.create({
    data: {
      username: `${prefix}-owner`,
      passwordHash: "$2b$12$not-used-for-authentication",
      role: "ADMIN",
    },
  });
  const otherUser = await prisma.user.create({
    data: {
      username: `${prefix}-other`,
      passwordHash: "$2b$12$not-used-for-authentication",
    },
  });
  principal = {
    userId: user.id,
    clientId: `${prefix}-client`,
    scopes: ["fitness:read", "fitness:write"],
  };
  other = { ...principal, userId: otherUser.id };
  const exercise = await prisma.exercise.create({
    data: {
      slug: `${prefix}-primary`,
      defaultName: `${prefix} A`,
      createdByUserId: otherUser.id,
      names: { create: { locale: "zh-TW", name: "測試動作", isPrimary: true } },
      aliases: {
        create: {
          locale: "en",
          alias: `${prefix} alias`,
          normalizedAlias: `${prefix} alias`,
        },
      },
      muscles: { create: { muscle: "CHEST", role: "PRIMARY" } },
      equipment: { create: { equipment: "BARBELL" } },
    },
  });
  exerciseId = exercise.id;
  const secondary = await prisma.exercise.create({
    data: { slug: `${prefix}-secondary`, defaultName: `${prefix} B` },
  });
  secondaryId = secondary.id;
  await prisma.exercise.create({
    data: { slug: `${prefix}-unused`, defaultName: `${prefix} C` },
  });
  const set = (
    weight: number,
    reps: number,
    order: number,
    type = "WORKING",
    completed = true,
    selectedExercise = exerciseId,
  ) => ({
    exerciseId: selectedExercise,
    weight,
    reps,
    order,
    type,
    completed,
    actualsEntered: completed,
  });
  for (const fixture of [
    {
      id: ids.first,
      day: "2026-10-03",
      sets: [
        set(999, 99, 4, "WORKING", false),
        set(60, 10, 2),
        set(200, 2, 1, "WARMUP"),
        set(20, 5, 3, "WORKING", true, secondaryId),
      ],
    },
    { id: ids.second, day: "2026-10-04", sets: [set(80, 3, 1)] },
    { id: ids.warmup, day: "2026-10-04", sets: [set(100, 1, 1, "WARMUP")] },
    { id: ids.empty, day: "2026-10-05", sets: [] },
    {
      id: ids.draft,
      day: "2026-10-04",
      sets: [set(2000, 10, 1)],
      state: "ACTIVE",
    },
    {
      id: ids.other,
      day: "2026-10-04",
      sets: [set(1500, 20, 1)],
      userId: other.userId,
    },
    { id: `${prefix}-before`, day: "2026-10-02", sets: [set(1999, 10, 1)] },
    { id: `${prefix}-end`, day: "2026-10-07", sets: [set(1999, 10, 1)] },
  ]) {
    await prisma.workout.create({
      data: {
        id: fixture.id,
        userId: fixture.userId ?? user.id,
        date: date(fixture.day),
        state: fixture.state ?? "COMPLETED",
        title: "Fixture workout",
        notes: "Private fixture notes",
        version: 7,
        sets: { create: fixture.sets },
      },
    });
  }

  await t.test(
    "context exposes only the account contract and explicit calendar rules",
    async () => {
      const context = await call("fitness_get_context", {});
      assert.equal(context.displayName, user.username.slice(0, 64));
      assert.deepEqual(context.scopes, principal.scopes);
      assert.deepEqual(context.units, units);
      assert.equal(context.dateRules.rangeEnd, "exclusive");
      assert.equal(context.limits.analysisSets, 50000);
      assert.ok(Number.isFinite(Date.parse(context.generatedAt)));
      assert.ok(!("passwordHash" in context));
      assert.ok(!("userId" in context));
    },
  );

  await t.test(
    "shared catalog uses a public projection, aliases and locale names",
    async () => {
      const result = await call("fitness_search_exercises", {
        query: prefix,
        locale: "en",
      });
      assert.equal(result.exercises.length, 3);
      assert.deepEqual(result.exercises[0], {
        id: exerciseId,
        slug: exercise.slug,
        defaultName: exercise.defaultName,
        names: [{ locale: "zh-TW", name: "測試動作", isPrimary: true }],
        aliases: [{ locale: "en", alias: `${prefix} alias` }],
        muscles: [{ muscle: "CHEST", role: "PRIMARY" }],
        equipment: ["BARBELL"],
      });
      assert.deepEqual(
        (
          await call(
            "fitness_search_exercises",
            { query: prefix, locale: "en" },
            other,
          )
        ).exercises,
        result.exercises,
      );
      for (const [query, locale] of [
        [`${prefix} alias`, "en"],
        ["測試動作", "zh-TW"],
      ]) {
        assert.ok(
          (
            await call("fitness_search_exercises", { query, locale })
          ).exercises.some((item) => item.id === exerciseId),
        );
      }
      assert.deepEqual(
        await call("fitness_search_exercises", {
          query: `${prefix}-missing`,
          locale: "en",
        }),
        { exercises: [], nextCursor: null },
      );
    },
  );

  await t.test(
    "owned detail includes ordered completed sets, never another owner's existence",
    async () => {
      const detail = await call("fitness_get_workout", {
        workoutId: ids.first,
      });
      assert.equal(detail.date, range.fromDate);
      assert.equal(detail.notes, "Private fixture notes");
      assert.equal(detail.version, 7);
      assert.deepEqual(
        detail.sets.map((item) => item.order),
        [1, 2, 3],
      );
      assert.deepEqual(
        detail.sets.map((item) => item.weightKg),
        [200, 60, 20],
      );
      assert.equal(detail.sets[0].rir, null);
      for (const workoutId of [ids.other, `${prefix}-missing`, ids.draft]) {
        await assert.rejects(
          call("fitness_get_workout", { workoutId }),
          rejects("NOT_FOUND"),
        );
      }
      await assert.rejects(
        call("fitness_get_workout", { workoutId: ids.first }, other),
        rejects("NOT_FOUND"),
      );
      const list = await call("fitness_list_workouts", range);
      assert.deepEqual(
        list.workouts.map((item) => item.workoutId),
        [ids.empty, ids.warmup, ids.second, ids.first],
      );
      assert.deepEqual(
        list.workouts.map((item) => item.totalVolumeKgReps),
        [0, 100, 240, 1100],
      );
      assert.ok(
        list.workouts.every(
          (item) => !("notes" in item) && !("userId" in item),
        ),
      );
      assert.deepEqual(
        (await call("fitness_list_workouts", range, other)).workouts.map(
          (item) => item.workoutId,
        ),
        [ids.other],
      );
      assert.deepEqual(
        (
          await call("fitness_list_workouts", {
            ...range,
            exerciseId: secondaryId,
          })
        ).workouts.map((item) => item.workoutId),
        [ids.first],
      );
    },
  );

  await t.test(
    "summary and exercise progress match fixture formulas and Sunday buckets",
    async () => {
      const summary = await call("fitness_get_training_summary", range);
      assert.deepEqual(
        [
          summary.workoutCount,
          summary.trainingDayCount,
          summary.setCount,
          summary.workingSetCount,
          summary.reps,
          summary.totalVolumeKgReps,
          summary.workingVolumeKgReps,
        ],
        [4, 2, 5, 3, 21, 1440, 940],
      );
      assert.deepEqual(
        summary.weekly.map((week) => [
          week.weekStartDate,
          week.workoutCount,
          week.totalVolumeKgReps,
        ]),
        [
          ["2026-09-27", 1, 1100],
          ["2026-10-04", 3, 340],
        ],
      );
      assert.deepEqual(summary.units, units);
      assert.equal(summary.inclusionRules.workingMetrics, "WORKING only");
      assert.equal(summary.fromDate, range.fromDate);
      const progress = await call("fitness_get_exercise_progress", {
        ...range,
        exerciseId,
      });
      assert.deepEqual(
        [
          progress.workoutCount,
          progress.setCount,
          progress.workingSetCount,
          progress.totalVolumeKgReps,
          progress.workingVolumeKgReps,
        ],
        [3, 4, 2, 1340, 840],
      );
      const source = await prisma.workoutSet.findFirstOrThrow({
        where: { workoutId: ids.second },
      });
      assert.deepEqual(progress.maxWeight, {
        setId: source.id,
        workoutId: ids.second,
        date: "2026-10-04",
        weightKg: 80,
        reps: 3,
        value: 80,
      });
      assert.equal(progress.estimatedOneRepMax?.value, 80 * (1 + 3 / 30));
      assert.equal(progress.estimatedOneRepMax?.setId, source.id);
      const warmup = progress.workouts.find(
        (item) => item.workoutId === ids.warmup,
      );
      assert.ok(warmup);
      assert.equal(warmup.workingSetCount, 0);
      assert.equal(warmup.maxWeight, null);
      assert.equal(warmup.estimatedOneRepMax, null);
      assert.ok(!JSON.stringify(summary).includes("Private fixture notes"));
      assert.ok(!JSON.stringify(progress).includes(ids.other));
      const emptyRange = {
        fromDate: "2026-11-01",
        toDateExclusive: "2026-11-02",
      };
      const emptySummary = await call(
        "fitness_get_training_summary",
        emptyRange,
      );
      assert.deepEqual(
        [
          emptySummary.workoutCount,
          emptySummary.trainingDayCount,
          emptySummary.totalVolumeKgReps,
        ],
        [0, 0, 0],
      );
      const emptyProgress = await call("fitness_get_exercise_progress", {
        ...emptyRange,
        exerciseId,
      });
      assert.equal(emptyProgress.maxWeight, null);
      assert.equal(emptyProgress.estimatedOneRepMax, null);
      assert.deepEqual(emptyProgress.workouts, []);
      await assert.rejects(
        call("fitness_get_exercise_progress", {
          ...range,
          exerciseId: `${prefix}-missing`,
        }),
        rejects("NOT_FOUND"),
      );
    },
  );

  await t.test(
    "workout keyset cursors bind owner, client and query and repeat ownership",
    async () => {
      const query = { ...range, limit: 1 };
      const first = await call("fitness_list_workouts", query);
      assert.ok(first.nextCursor);
      const cursor = first.nextCursor;
      for (const owner of [
        other,
        { ...principal, clientId: `${prefix}-different` },
      ]) {
        await assert.rejects(
          call("fitness_list_workouts", { ...query, cursor }, owner),
          rejects("INVALID_CURSOR"),
        );
      }
      for (const changed of [
        { limit: 2 },
        { fromDate: "2026-10-02" },
        { exerciseId },
      ]) {
        await assert.rejects(
          call("fitness_list_workouts", { ...query, ...changed, cursor }),
          rejects("INVALID_CURSOR"),
        );
      }
      const decoded = JSON.parse(
        Buffer.from(cursor, "base64url").toString("utf8"),
      );
      for (const tampered of [
        "not-a-cursor!",
        Buffer.from(
          JSON.stringify({ ...decoded, binding: "0".repeat(64) }),
        ).toString("base64url"),
        Buffer.from(JSON.stringify({ ...decoded, id: ids.other })).toString(
          "base64url",
        ),
      ]) {
        await assert.rejects(
          call("fitness_list_workouts", { ...query, cursor: tampered }),
          rejects("INVALID_CURSOR"),
        );
      }
      const inserted = await prisma.workout.create({
        data: {
          userId: principal.userId,
          date: date("2026-10-06"),
          state: "COMPLETED",
        },
      });
      try {
        const seen = first.workouts.map((item) => item.workoutId);
        let next: string | null = cursor;
        while (next) {
          const page: McpToolOutput<"fitness_list_workouts"> = await call(
            "fitness_list_workouts",
            {
              ...query,
              cursor: next,
            },
          );
          seen.push(...page.workouts.map((item) => item.workoutId));
          next = page.nextCursor;
          assert.ok(
            seen.length <= 4,
            "pagination must terminate without duplicate anchors",
          );
        }
        assert.deepEqual(seen, [ids.empty, ids.warmup, ids.second, ids.first]);
      } finally {
        await prisma.workout.delete({ where: { id: inserted.id } });
      }
    },
  );

  await t.test("catalog keysets bind query and principal", async () => {
    const query = { query: prefix, locale: "en", limit: 1 };
    const first = await call("fitness_search_exercises", query);
    assert.ok(first.nextCursor);
    const cursor = first.nextCursor;
    for (const changed of [
      { query: `${prefix} A` },
      { locale: "zh-TW" },
      { limit: 2 },
    ]) {
      await assert.rejects(
        call("fitness_search_exercises", { ...query, ...changed, cursor }),
        rejects("INVALID_CURSOR"),
      );
    }
    await assert.rejects(
      call("fitness_search_exercises", { ...query, cursor }, other),
      rejects("INVALID_CURSOR"),
    );
    await assert.rejects(
      call("fitness_search_exercises", { ...query, cursor: `${cursor}!` }),
      rejects("INVALID_CURSOR"),
    );
    const second = await call("fitness_search_exercises", { ...query, cursor });
    assert.equal(second.exercises[0].id, secondaryId);
    assert.ok(second.nextCursor);
    const last = await call("fitness_search_exercises", {
      ...query,
      cursor: second.nextCursor,
    });
    assert.equal(last.exercises.length, 1);
    assert.equal(last.nextCursor, null);
    assert.notEqual(last.exercises[0].id, exerciseId);
  });

  await t.test(
    "detail and catalog projections enforce nested result bounds",
    async () => {
      const workout = await prisma.workout.create({
        data: {
          userId: principal.userId,
          date: date("2026-11-10"),
          state: "COMPLETED",
          sets: {
            create: Array.from({ length: 200 }, (_, index) =>
              set(20, 5, index + 1),
            ),
          },
        },
      });
      try {
        assert.equal(
          (await call("fitness_get_workout", { workoutId: workout.id })).sets
            .length,
          200,
        );
        const extra = await prisma.workoutSet.create({
          data: { ...set(20, 5, 201), workoutId: workout.id },
        });
        await assert.rejects(
          call("fitness_get_workout", { workoutId: workout.id }),
          rejects("RANGE_TOO_LARGE"),
        );
        await prisma.workoutSet.update({
          where: { id: extra.id },
          data: { completed: false },
        });
        assert.equal(
          (await call("fitness_get_workout", { workoutId: workout.id })).sets
            .length,
          200,
        );
      } finally {
        await prisma.workout.delete({ where: { id: workout.id } });
      }
      const bounded = await prisma.exercise.create({
        data: {
          slug: `${prefix}-bounded`,
          defaultName: `${prefix} Bounded`,
          createdByUserId: other.userId,
          names: {
            create: Array.from({ length: 51 }, (_, index) => ({
              locale: "en",
              name: `${prefix} name ${String(index).padStart(2, "0")}`,
            })),
          },
          aliases: {
            create: Array.from({ length: 51 }, (_, index) => ({
              locale: "en",
              alias: `${prefix} bounded ${index}`,
              normalizedAlias: `${prefix} bounded ${index}`,
            })),
          },
        },
      });
      const result = await call("fitness_search_exercises", {
        query: `${prefix} Bounded`,
        locale: "en",
      });
      assert.equal(result.exercises.length, 1);
      assert.equal(result.exercises[0].id, bounded.id);
      assert.equal(result.exercises[0].names.length, 50);
      assert.equal(result.exercises[0].aliases.length, 50);
      assert.ok(!("createdByUserId" in result.exercises[0]));
    },
  );

  await t.test(
    "service scopes and strict validation cannot select an owner",
    async () => {
      const readOnly = { ...principal, scopes: ["fitness:read"] };
      const writeOnly = { ...principal, scopes: ["fitness:write"] };
      await assert.rejects(
        call("fitness_record_workout", payload(), readOnly),
        rejects("INSUFFICIENT_SCOPE"),
      );
      await assert.rejects(
        call("fitness_get_context", {}, writeOnly),
        rejects("INSUFFICIENT_SCOPE"),
      );
      await assert.rejects(
        call("fitness_get_context", { userId: other.userId }),
        rejects("INVALID_INPUT"),
      );
      await assert.rejects(
        call("fitness_list_workouts", { ...range, limit: 51 }),
        rejects("INVALID_INPUT"),
      );
      await assert.rejects(
        call("fitness_get_training_summary", {
          fromDate: "2025-01-01",
          toDateExclusive: "2026-10-07",
        }),
        rejects("INVALID_INPUT"),
      );
    },
  );

  await t.test(
    "invalid multi-set submissions leave no workout, set or receipt",
    async () => {
      const before = await counts();
      const valid = payload();
      for (const invalid of [
        { ...valid, sets: [...valid.sets, { ...valid.sets[0], reps: 0 }] },
        {
          ...valid,
          sets: [
            ...valid.sets,
            { ...valid.sets[0], exerciseId: `${prefix}-missing` },
          ],
        },
        { ...valid, sets: [...valid.sets, { ...valid.sets[0], rir: 0.25 }] },
      ]) {
        await assert.rejects(
          call("fitness_record_workout", invalid),
          rejects(
            invalid.sets.at(-1)?.exerciseId === `${prefix}-missing`
              ? "NOT_FOUND"
              : "INVALID_INPUT",
          ),
        );
        assert.deepEqual(await counts(), before);
      }
    },
  );

  await t.test(
    "record, replay, conflict and deleted-result tombstone",
    async () => {
      const input = payload();
      const before = await counts();
      const saved = await call("fitness_record_workout", input);
      assert.equal(saved.retry, false);
      assert.equal(saved.savedSetCount, 2);
      assert.equal(saved.date, "2026-10-31");
      assert.deepEqual(saved.units, units);
      const detail = await call("fitness_get_workout", {
        workoutId: saved.workoutId,
      });
      assert.equal(detail.title, "Completed training");
      assert.equal(detail.notes, "Workout notes");
      assert.deepEqual(
        detail.sets.map((item) => [item.order, item.rir, item.notes]),
        [
          [1, null, null],
          [2, 1.5, "Set notes"],
        ],
      );
      const replay = await call("fitness_record_workout", {
        ...input,
        title: "Completed training",
        notes: "Workout notes",
      });
      assert.deepEqual(replay, { ...saved, retry: true });
      assert.deepEqual(await counts(), [
        before[0] + 1,
        before[1] + 2,
        before[2] + 1,
      ]);
      await assert.rejects(
        call("fitness_record_workout", {
          ...input,
          sets: [{ ...input.sets[0], reps: 11 }, input.sets[1]],
        }),
        rejects("IDEMPOTENCY_CONFLICT"),
      );
      const receipt = await prisma.mcpWriteReceipt.findFirstOrThrow({
        where: { userId: principal.userId, operationId: input.operationId },
      });
      assert.match(receipt.payloadHash, /^[a-f0-9]{64}$/);
      assert.ok(!("payload" in receipt));
      await prisma.workout.delete({ where: { id: saved.workoutId } });
      assert.equal(
        (
          await prisma.mcpWriteReceipt.findUniqueOrThrow({
            where: { id: receipt.id },
          })
        ).workoutId,
        null,
      );
      await assert.rejects(
        call("fitness_record_workout", input),
        rejects("RESULT_REMOVED"),
      );
      assert.deepEqual(await counts(), [before[0], before[1], before[2] + 1]);
    },
  );

  await t.test(
    "cancelled principals cannot read or mutate workout data",
    async () => {
      const controller = new AbortController();
      controller.abort();
      const cancelled = { ...principal, signal: controller.signal };
      const before = await counts();
      await assert.rejects(
        call("fitness_record_workout", payload(), cancelled),
        rejects("REQUEST_CANCELLED"),
      );
      await assert.rejects(
        call("fitness_get_context", {}, cancelled),
        rejects("REQUEST_CANCELLED"),
      );
      assert.deepEqual(await counts(), before);
    },
  );

  await t.test(
    "a carried grant is rechecked before recording or replaying",
    async () => {
      await prisma.mcpClient.create({
        data: {
          id: principal.clientId,
          name: "Service grant test client",
          preRegistered: true,
          redirectUris: "[]",
        },
      });
      const grant = await prisma.mcpGrant.create({
        data: {
          userId: principal.userId,
          clientId: principal.clientId,
          resource: "https://fitness.example/mcp",
          scopes: "fitness:read fitness:write",
          expiresAt: new Date(Date.now() + 3600_000),
        },
      });
      const authorized = { ...principal, grantId: grant.id };
      const input = payload();
      const saved = await call("fitness_record_workout", input, authorized);
      assert.equal(saved.retry, false);
      const before = await counts();
      for (const invalid of [
        { ...authorized, grantId: `${prefix}-missing-grant` },
        { ...other, grantId: grant.id },
        { ...authorized, clientId: `${prefix}-wrong-client` },
      ]) {
        await assert.rejects(
          call("fitness_record_workout", payload(), invalid),
          rejects("INSUFFICIENT_SCOPE"),
        );
      }
      for (const update of [
        { revokedAt: new Date() },
        { revokedAt: null, expiresAt: new Date(0) },
        { expiresAt: new Date(Date.now() + 3600_000), scopes: "fitness:read" },
      ]) {
        await prisma.mcpGrant.update({ where: { id: grant.id }, data: update });
        await assert.rejects(
          call("fitness_record_workout", input, authorized),
          rejects("INSUFFICIENT_SCOPE"),
        );
        await assert.rejects(
          call("fitness_record_workout", payload(), authorized),
          rejects("INSUFFICIENT_SCOPE"),
        );
        assert.deepEqual(await counts(), before);
      }
    },
  );

  await t.test(
    "analysis accepts the exact performed-set budget and rejects incomplete totals above it",
    async () => {
      const workout = await prisma.workout.create({
        data: { userId: principal.userId, date: date("2026-11-01") },
      });
      const budgetRange = {
        fromDate: "2026-11-01",
        toDateExclusive: "2026-11-02",
      };
      try {
        await prisma.workoutSet.createMany({
          data: Array.from({ length: 50000 }, (_, index) => ({
            workoutId: workout.id,
            exerciseId,
            order: index + 1,
            weight: 1,
            reps: 1,
          })),
        });
        const exact = await call("fitness_get_training_summary", budgetRange);
        assert.equal(exact.setCount, 50000);
        assert.equal(exact.totalVolumeKgReps, 50000);
        await prisma.workoutSet.create({
          data: {
            workoutId: workout.id,
            exerciseId,
            order: 50001,
            weight: 1,
            reps: 1,
          },
        });
        await assert.rejects(
          call("fitness_get_training_summary", budgetRange),
          rejects("RANGE_TOO_LARGE"),
        );
        await assert.rejects(
          call("fitness_get_exercise_progress", { ...budgetRange, exerciseId }),
          rejects("RANGE_TOO_LARGE"),
        );
      } finally {
        await prisma.workout.delete({ where: { id: workout.id } });
      }
    },
  );

  await t.test(
    "concurrent duplicate submissions commit once and operation keys are principal-scoped",
    async () => {
      const input = payload();
      const before = await counts();
      const results = await Promise.all(
        Array.from({ length: 4 }, () => call("fitness_record_workout", input)),
      );
      assert.equal(new Set(results.map((item) => item.workoutId)).size, 1);
      assert.equal(results.filter((item) => !item.retry).length, 1);
      assert.deepEqual(await counts(), [
        before[0] + 1,
        before[1] + 2,
        before[2] + 1,
      ]);
      const otherUserResult = await call(
        "fitness_record_workout",
        input,
        other,
      );
      const otherClientResult = await call("fitness_record_workout", input, {
        ...principal,
        clientId: `${prefix}-another-client`,
      });
      assert.notEqual(otherUserResult.workoutId, results[0].workoutId);
      assert.notEqual(otherClientResult.workoutId, results[0].workoutId);
      assert.equal(otherUserResult.retry, false);
      assert.equal(otherClientResult.retry, false);
    },
  );
});
