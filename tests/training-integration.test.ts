import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { basename, dirname, isAbsolute } from "node:path";
import { after, test } from "node:test";
import { formatDateKey, parseDateKey } from "@narumitw/fitness-core/calendar";
import { calculateStats } from "@narumitw/fitness-core/stats-calculations";
import { ApiError } from "../apps/api/src/errors";
import {
  confirmImport,
  exportWorkouts,
  previewImport,
} from "../apps/api/src/lib/data-transfer";
import { prisma } from "../apps/api/src/lib/prisma";
import { suggestions } from "../apps/api/src/lib/progression";
import { updateRecordedSet } from "../apps/api/src/lib/recorded-sets";
import { createRecordedWorkout } from "../apps/api/src/lib/recorded-workouts";
import {
  changeSession,
  startSession,
} from "../apps/api/src/lib/session-service";
import { updateSetSchema } from "../apps/api/src/lib/validation";
import {
  occurrenceFingerprint,
  serializeWorkouts,
} from "../apps/api/src/lib/workout-csv";
import { priorSessions } from "../apps/api/src/lib/workout-history";

// Refuse direct execution against local or inherited production databases.
const databaseUrl = process.env.DATABASE_URL ?? "";
const sqlitePath = databaseUrl.startsWith("file:") ? databaseUrl.slice(5) : "";
const isolatedDatabase =
  process.env.NODE_ENV === "production"
    ? /^postgresql:\/\/fitness:fitness@127\.0\.0\.1:\d+\/fitness$/.test(
        databaseUrl,
      )
    : isAbsolute(sqlitePath) &&
      basename(dirname(sqlitePath)).startsWith("fitness-training-") &&
      basename(sqlitePath) === "test.db";
if (!isolatedDatabase) {
  throw new Error("Run database tests through tests/run-training.mjs.");
}

const date = (key: string) => parseDateKey(key) as Date;
after(() => prisma.$disconnect());
test("legacy upgrade retains performed values and defaults", async () => {
  const w = await prisma.workout.findUniqueOrThrow({
    where: { id: "legacy-workout" },
    include: { sets: { include: { exercise: true } } },
  });
  assert.equal(w.state, "COMPLETED");
  assert.equal(w.sets[0].completed, true);
  assert.equal(w.sets[0].actualsEntered, true);
  assert.equal(w.sets[0].type, "WORKING");
  assert.equal(w.sets[0].rir, null);
  assert.equal(w.sets[0].weight, 42.5);
  assert.equal(w.sets[0].reps, 7);
  assert.equal(w.sets[0].id, "legacy-set");
  assert.equal(w.sets[0].exerciseId, "legacy-exercise");
  const template = await prisma.workoutTemplate.findUniqueOrThrow({
    where: { id: "legacy-template" },
    include: { sets: true, rules: true },
  });
  assert.equal(template.sets[0].type, "WORKING");
  assert.equal(template.sets[0].weight, 42.5);
  assert.equal(template.sets[0].reps, 7);
  assert.equal(template.rules.length, 0);
  assert.equal(
    await prisma.exerciseMuscle.count({
      where: { exerciseId: "legacy-exercise" },
    }),
    0,
  );
  assert.equal(
    (
      await prisma.exerciseAlias.findUniqueOrThrow({
        where: { id: "legacy-alias" },
      })
    ).alias,
    "Legacy alias",
  );
  const stats = calculateStats([w]);
  assert.equal(stats.overview.totalSets, 1);
  assert.equal(stats.overview.totalVolume, 297.5);
  assert.equal(stats.overview.trainingDays, 1);
  assert.equal(stats.allTimeRecords[0].maxWeight.value, 42.5);
});
test("actual-entry migration preserves saved uncompleted zero-weight single-rep values", async () => {
  const set = await prisma.workoutSet.findUniqueOrThrow({
    where: { id: "saved-zero-set" },
  });
  assert.equal(set.weight, 0);
  assert.equal(set.reps, 1);
  assert.equal(set.completed, false);
  assert.equal(set.actualsEntered, true);
});
test("owner-scoped training services, retries, correction, scheduling and data round trip", async (t) => {
  const user = await prisma.user.create({
    data: { username: `owner-${randomUUID()}`, passwordHash: "test" },
  });
  const other = await prisma.user.create({
    data: { username: `foreign-${randomUUID()}`, passwordHash: "test" },
  });
  const exercise = await prisma.exercise.create({
    data: {
      slug: randomUUID(),
      defaultName: "Roadmap Squat",
      createdByUserId: user.id,
      aliases: {
        create: {
          locale: "en",
          alias: "Roadmap Alias",
          normalizedAlias: "roadmap alias",
        },
      },
    },
  });
  const another = await prisma.exercise.create({
    data: { slug: randomUUID(), defaultName: "Other exercise" },
  });
  const template = await prisma.workoutTemplate.create({
    data: {
      userId: user.id,
      title: "Routine",
      sets: {
        create: [
          { exerciseId: exercise.id, order: 1, weight: 100, reps: 5 },
          {
            exerciseId: exercise.id,
            order: 2,
            weight: 20,
            reps: 5,
            type: "WARMUP",
          },
        ],
      },
    },
  });
  const recorded = async (
    userId: string,
    key: string,
    weight: number,
    id?: string,
    createdAt?: Date,
  ) =>
    prisma.workout.create({
      data: {
        id,
        userId,
        date: date(key),
        createdAt,
        sets: {
          create: { exerciseId: exercise.id, order: 1, weight, reps: 5 },
        },
      },
    });
  await t.test(
    "prior history excludes same-day, future, current and foreign values and responds to corrections",
    async () => {
      const old = await recorded(
        user.id,
        "2026-10-01",
        50,
        undefined,
        new Date("2026-10-01T12:00:00Z"),
      );
      const tied = await recorded(
        user.id,
        "2026-10-01",
        60,
        "tie-z",
        new Date("2026-10-02T12:00:00Z"),
      );
      await recorded(
        user.id,
        "2026-10-01",
        55,
        "tie-a",
        new Date("2026-10-02T12:00:00Z"),
      );
      await recorded(user.id, "2026-10-10", 900);
      await recorded(user.id, "2026-10-11", 999);
      await recorded(other.id, "2026-10-09", 2000);
      const p = await priorSessions(user.id, "none", date("2026-10-10"), [
        exercise.id,
        another.id,
      ]);
      assert.equal(p[exercise.id].sets[0].weight, 60);
      assert.equal(p[another.id], undefined);
      await prisma.workoutSet.updateMany({
        where: { workoutId: tied.id },
        data: { weight: 65 },
      });
      assert.equal(
        (
          await priorSessions(user.id, "none", date("2026-10-10"), [
            exercise.id,
          ])
        )[exercise.id].sets[0].weight,
        65,
      );
      await prisma.workout.delete({ where: { id: tied.id } });
      assert.equal(
        (
          await priorSessions(user.id, "tie-a", date("2026-10-10"), [
            exercise.id,
          ])
        )[exercise.id].sets[0].weight,
        50,
      );
      await prisma.workout.delete({ where: { id: old.id } });
    },
  );
  await t.test(
    "cached retrospective forms preserve type and RIR and reject foreign writes",
    async () => {
      const w = await prisma.workout.create({
        data: {
          userId: user.id,
          date: date("2026-10-01"),
          sets: {
            create: {
              exerciseId: exercise.id,
              order: 1,
              weight: 20,
              reps: 5,
              type: "WARMUP",
              rir: 2.5,
            },
          },
        },
        include: { sets: true },
      });
      const input = updateSetSchema.parse({
        workoutId: w.id,
        setId: w.sets[0].id,
        exerciseId: exercise.id,
        order: 1,
        weight: 25,
        reps: 6,
      });
      await assert.rejects(updateRecordedSet(other.id, input));
      await updateRecordedSet(user.id, input, { type: false, rir: false });
      const saved = await prisma.workoutSet.findUniqueOrThrow({
        where: { id: input.setId },
      });
      assert.equal(saved.type, "WARMUP");
      assert.equal(saved.rir, 2.5);
      assert.equal(saved.weight, 25);
      await updateRecordedSet(user.id, {
        ...input,
        type: "WORKING",
        rir: null,
      });
      const cleared = await prisma.workoutSet.findUniqueOrThrow({
        where: { id: input.setId },
      });
      assert.equal(cleared.type, "WORKING");
      assert.equal(cleared.rir, null);
      await prisma.workout.delete({ where: { id: w.id } });
    },
  );
  let activeId = "";
  await t.test(
    "starts are repeat-safe, targets are snapshots and unfinished work is excluded",
    async () => {
      const input = {
        source: "template",
        sourceId: template.id,
        date: "2026-10-09",
        key: randomUUID(),
        restSeconds: 90,
      };
      const a = await startSession(user.id, input);
      const b = await startSession(user.id, input);
      assert.equal(a.id, b.id);
      activeId = a.id;
      await assert.rejects(
        startSession(other.id, { ...input, key: randomUUID() }),
      );
      const w = await prisma.workout.findUniqueOrThrow({
        where: { id: a.id },
        include: { sets: { include: { exercise: true } } },
      });
      assert.equal(w.state, "ACTIVE");
      assert.equal(w.sets[0].completed, false);
      assert.equal(w.sets[0].actualsEntered, false);
      assert.equal(w.sets[0].targetWeight, 100);
      const stats = calculateStats([w]);
      assert.equal(stats.overview.totalVolume, 0);
      assert.equal(stats.overview.trainingDays, 0);
      assert.equal(stats.allTimeRecords.length, 0);
      await prisma.workoutTemplateSet.updateMany({
        where: { templateId: template.id, type: "WORKING" },
        data: { weight: 120 },
      });
      assert.equal(
        (
          await prisma.workoutSet.findFirstOrThrow({
            where: { workoutId: w.id, type: "WORKING" },
          })
        ).targetWeight,
        100,
      );
      await prisma.workoutTemplateSet.updateMany({
        where: { templateId: template.id, type: "WORKING" },
        data: { weight: 100 },
      });
    },
  );
  await t.test(
    "confirmed set completion, stale tabs, pause/resume and explicit partial finish survive reads",
    async () => {
      let w = await prisma.workout.findUniqueOrThrow({
        where: { id: activeId },
        include: { sets: true },
      });
      const s = w.sets.find((s) => s.type === "WORKING");
      assert.ok(s);
      const missingActuals = {
        workoutId: w.id,
        version: w.version,
        command: "complete",
        setId: s.id,
      };
      for (const actuals of [
        undefined,
        { weight: "", reps: 5 },
        { weight: null, reps: 5 },
        { weight: 100, reps: 0 },
        { weight: Infinity, reps: 5 },
      ]) {
        await assert.rejects(
          changeSession(user.id, { ...missingActuals, actuals }),
        );
      }
      const unchanged = await prisma.workout.findUniqueOrThrow({
        where: { id: w.id },
        include: { sets: true },
      });
      assert.equal(unchanged.version, w.version);
      assert.equal(unchanged.restDeadline, null);
      assert.equal(
        unchanged.sets.find((set) => set.id === s.id)?.completed,
        false,
      );
      const complete = {
        workoutId: w.id,
        version: w.version,
        command: "complete",
        setId: s.id,
        actuals: { weight: 100, reps: 5, rir: 0 },
      };
      await assert.rejects(changeSession(other.id, complete));
      const concurrent = await Promise.allSettled([
        changeSession(user.id, complete),
        changeSession(user.id, complete),
      ]);
      assert.ok(concurrent.some((result) => result.status === "fulfilled"));
      await changeSession(user.id, complete);
      const confirmed = await prisma.workoutSet.findUniqueOrThrow({
        where: { id: s.id },
      });
      assert.equal(confirmed.actualsEntered, true);
      assert.equal(confirmed.weight, 100);
      assert.equal(confirmed.reps, 5);
      assert.equal(confirmed.completed, true);
      assert.equal(confirmed.rir, 0);
      await assert.rejects(
        changeSession(user.id, {
          workoutId: w.id,
          version: 0,
          command: "pause",
        }),
      );
      w = await prisma.workout.findUniqueOrThrow({
        where: { id: w.id },
        include: { sets: true },
      });
      assert.ok(w.restDeadline);
      await changeSession(user.id, {
        workoutId: w.id,
        version: w.version,
        command: "pause",
      });
      w = await prisma.workout.findUniqueOrThrow({
        where: { id: w.id },
        include: { sets: true },
      });
      assert.equal(w.restDeadline, null);
      await changeSession(user.id, {
        workoutId: w.id,
        version: w.version,
        command: "resume",
      });
      w = await prisma.workout.findUniqueOrThrow({
        where: { id: w.id },
        include: { sets: true },
      });
      await assert.rejects(
        changeSession(user.id, {
          workoutId: w.id,
          version: w.version,
          command: "finish",
        }),
      );
      await changeSession(user.id, {
        workoutId: w.id,
        version: w.version,
        command: "finish",
        partial: true,
      });
      await changeSession(user.id, {
        workoutId: w.id,
        version: w.version,
        command: "finish",
        partial: true,
      });
      await assert.rejects(
        changeSession(user.id, {
          workoutId: w.id,
          version: w.version + 1,
          command: "resume",
        }),
      );
    },
  );
  await t.test(
    "progression is default-off, excludes foreign/future sessions and reacts to corrected history",
    async () => {
      const w = await startSession(user.id, {
        source: "template",
        sourceId: template.id,
        date: "2026-10-10",
        key: randomUUID(),
        restSeconds: 90,
      });
      assert.deepEqual(await suggestions(user.id, w.id), []);
      await prisma.progressionRule.create({
        data: {
          templateId: template.id,
          exerciseId: exercise.id,
          increment: 2.5,
        },
      });
      assert.equal((await suggestions(user.id, w.id))[0].weight, 102.5);
      assert.deepEqual(await suggestions(other.id, w.id), []);
      await prisma.workoutSet.updateMany({
        where: { workoutId: activeId, type: "WORKING" },
        data: { reps: 4 },
      });
      assert.equal((await suggestions(user.id, w.id))[0].weight, null);
    },
  );
  await t.test(
    "dated scheduled starts are atomic and template deletion retains snapshot history",
    async () => {
      const today = date(formatDateKey(new Date()));
      const d = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() + 3,
      );
      const past = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() - 7,
      );
      await prisma.templateSchedule.create({
        data: {
          userId: user.id,
          templateId: template.id,
          title: "Past routine",
          weekday: past.getDay(),
          effectiveFrom: past,
        },
      });
      const pastInput = {
        source: "template",
        sourceId: template.id,
        date: formatDateKey(past),
        key: randomUUID(),
        restSeconds: 30,
        scheduled: true,
      };
      const before = await prisma.workout.count({ where: { userId: user.id } });
      await assert.rejects(
        startSession(user.id, pastInput),
        (error: unknown) =>
          error instanceof ApiError &&
          error.status === 409 &&
          error.code === "CONFLICT",
      );
      assert.equal(
        await prisma.workout.count({ where: { userId: user.id } }),
        before,
      );
      // Existing occurrences remain retrievable after their calendar date passes.
      const existing = await prisma.workout.create({
        data: {
          userId: user.id,
          date: past,
          plannedDate: past,
          state: "ACTIVE",
        },
      });
      assert.equal((await startSession(user.id, pastInput)).id, existing.id);
      const todayInput = {
        ...pastInput,
        date: formatDateKey(today),
        key: randomUUID(),
      };
      assert.ok((await startSession(user.id, todayInput)).id);
      await prisma.templateSchedule.create({
        data: {
          userId: user.id,
          templateId: template.id,
          title: "Routine",
          weekday: d.getDay(),
          effectiveFrom: date("2026-10-01"),
        },
      });
      const input = {
        source: "template",
        sourceId: template.id,
        date: formatDateKey(d),
        key: randomUUID(),
        restSeconds: 30,
        scheduled: true,
      };
      const results = await Promise.all([
        startSession(user.id, input),
        startSession(user.id, { ...input, key: randomUUID() }),
      ]);
      assert.equal(results[0].id, results[1].id);
      await prisma.workoutTemplate.delete({ where: { id: template.id } });
      const kept = await prisma.workout.findUniqueOrThrow({
        where: { id: results[0].id },
      });
      assert.equal(kept.templateId, null);
      assert.equal(kept.templateTitle, "Routine");
      assert.equal(kept.plannedDate?.getTime(), d.getTime());
    },
  );
  await t.test(
    "daily measurements are unique per owner and cascade without exposing other owners",
    async () => {
      const d = date("2026-10-10");
      await prisma.bodyMeasurement.create({
        data: { userId: user.id, date: d, weight: 75 },
      });
      await prisma.bodyMeasurement.create({
        data: { userId: other.id, date: d, waist: 90 },
      });
      await assert.rejects(
        prisma.bodyMeasurement.create({
          data: { userId: user.id, date: d, weight: 76 },
        }),
      );
      assert.equal(
        (
          await prisma.bodyMeasurement.findMany({ where: { userId: user.id } })
        )[0].waist,
        null,
      );
    },
  );
  await t.test(
    "CSV preview writes nothing; confirmation is atomic, owner-scoped, nondestructive and repeat-safe",
    async () => {
      const source = await exportWorkouts(user.id);
      const csv = serializeWorkouts(source);
      const before = await prisma.workout.count();
      const p = await previewImport(other.id, csv);
      assert.equal(p.errors.length, 0);
      assert.equal(p.unknown.length, 0);
      assert.equal(await prisma.workout.count(), before);
      const invalid = csv.replace("'Roadmap Squat", "'Unknown movement");
      const count = await prisma.workout.count({ where: { userId: other.id } });
      await assert.rejects(confirmImport(other.id, invalid, {}));
      assert.equal(
        await prisma.workout.count({ where: { userId: other.id } }),
        count,
      );
      assert.equal(
        await prisma.importBatch.count({ where: { userId: other.id } }),
        0,
      );
      const first = await confirmImport(other.id, csv, {});
      assert.equal(first.imported, source.length);
      const retry = await confirmImport(other.id, csv, {});
      assert.equal(retry.imported, 0);
      assert.equal(retry.skipped, source.length);
      const second = await confirmImport(other.id, `${csv}\r\n`, {}).catch(
        () => null,
      ); // A changed malformed file is rejected rather than replacing data.
      assert.equal(second, null);
      const exported = await exportWorkouts(other.id);
      assert.equal(exported.length, count + source.length);
      assert.ok(
        exported
          .filter((w) => w.state === "ACTIVE")
          .every((w) => w.activeSeconds === 0),
      );
      const imported = await prisma.workout.findMany({
        where: { userId: other.id, importBatchId: { not: null } },
      });
      assert.ok(
        imported.every((w) => w.restDeadline === null && w.resumedAt === null),
      );
      const importedSets = await prisma.workoutSet.findMany({
        where: { workout: { userId: other.id, importBatchId: { not: null } } },
      });
      assert.ok(importedSets.every((s) => s.actualsEntered));
      assert.equal(
        await prisma.workout.count({ where: { userId: user.id } }),
        source.length,
      );
    },
  );
  await t.test(
    "identical same-day sessions retain multiplicity; mid-batch failure rolls back all rows",
    async () => {
      const workout = {
        key: "identical-one",
        date: "2026-10-09",
        title: "Identical sessions",
        notes: null,
        state: "COMPLETED",
        activeSeconds: 0,
        templateTitle: null,
        sets: [
          {
            order: 1,
            exercise: exercise.defaultName,
            weight: 25,
            reps: 5,
            notes: null,
            type: "WORKING" as const,
            rir: null,
            completed: true,
            targetWeight: null,
            targetReps: null,
          },
        ],
      };
      const file = serializeWorkouts([
        workout,
        { ...workout, key: "identical-two" },
      ]);
      assert.equal((await confirmImport(other.id, file, {})).imported, 2);
      const aliasFile = serializeWorkouts([
        {
          ...workout,
          sets: [{ ...workout.sets[0], exercise: "Roadmap Alias" }],
        },
        {
          ...workout,
          key: "identical-two",
          sets: [{ ...workout.sets[0], exercise: "roadmap alias" }],
        },
      ]);
      const preview = await previewImport(other.id, aliasFile);
      assert.equal(preview.duplicates, 2);
      assert.deepEqual(preview.unknown, []);
      assert.deepEqual(await confirmImport(other.id, aliasFile, {}), {
        imported: 0,
        skipped: 2,
      });
      const changedKeys = file
        .replace("identical-one", "first-key")
        .replace("identical-two", "second-key");
      assert.deepEqual(await confirmImport(other.id, changedKeys, {}), {
        imported: 0,
        skipped: 2,
      });
      const before = await prisma.workout.count({
        where: { userId: other.id },
      });
      const failed = serializeWorkouts([
        { ...workout, title: "Atomic first" },
        {
          ...workout,
          key: "second",
          title: "Atomic second",
          sets: [{ ...workout.sets[0], exercise: "Unmapped atomic movement" }],
        },
      ]);
      await assert.rejects(confirmImport(other.id, failed, {}));
      assert.equal(
        await prisma.workout.count({ where: { userId: other.id } }),
        before,
      );
      assert.equal(
        await prisma.workout.count({
          where: { userId: other.id, title: "Atomic first" },
        }),
        0,
      );
    },
  );
  await t.test(
    "batch-specific recovery removes only unchanged rows from that owner and batch",
    async () => {
      const owned = await prisma.workout.findMany({
        where: { userId: other.id, title: "Identical sessions" },
        select: { id: true, importBatchId: true, fingerprint: true },
      });
      assert.equal(owned.length, 2);
      const fingerprints = new Map<string, number>();
      const content = (await exportWorkouts(other.id)).filter(
        (workout) => workout.title === "Identical sessions",
      );
      assert.deepEqual(
        content
          .map((workout) => occurrenceFingerprint(workout, fingerprints))
          .sort(),
        owned.map((workout) => workout.fingerprint).sort(),
      );
      const batchId = owned[0].importBatchId;
      assert.ok(batchId);
      const before = await prisma.workout.count({
        where: { userId: other.id },
      });
      const foreignBefore = await prisma.workout.count({
        where: { userId: user.id },
      });
      await prisma.$transaction(async (tx) => {
        const rows = await tx.workout.findMany({
          where: { userId: other.id, importBatchId: batchId },
          select: { id: true },
        });
        assert.deepEqual(
          rows.map((row) => row.id).sort(),
          owned.map((row) => row.id).sort(),
        );
        await tx.workout.deleteMany({
          where: {
            userId: other.id,
            importBatchId: batchId,
            id: { in: rows.map((row) => row.id) },
          },
        });
        await tx.importBatch.deleteMany({
          where: { id: batchId, userId: other.id },
        });
      });
      assert.equal(
        await prisma.workout.count({ where: { userId: other.id } }),
        before - 2,
      );
      assert.equal(
        await prisma.workout.count({ where: { userId: user.id } }),
        foreignBefore,
      );
    },
  );
  await prisma.user.delete({ where: { id: user.id } });
  await prisma.user.delete({ where: { id: other.id } });
  assert.equal(
    await prisma.bodyMeasurement.count({ where: { userId: other.id } }),
    0,
  );
});

test("recorded creation deduplicates retries and concurrent writes without crossing users or live starts", async () => {
  const user = await prisma.user.create({
    data: { username: randomUUID(), passwordHash: "test-hash" },
  });
  const other = await prisma.user.create({
    data: { username: randomUUID(), passwordHash: "test-hash" },
  });
  try {
    const key = randomUUID();
    const input = {
      key,
      title: "Recorded creation",
      notes: "Original",
      date: "2026-10-12",
    };
    const [first, concurrent] = await Promise.all([
      createRecordedWorkout(user.id, input),
      createRecordedWorkout(user.id, input),
    ]);
    assert.equal(first.id, concurrent.id);
    assert.equal(await prisma.workout.count({ where: { userId: user.id } }), 1);
    const retry = await createRecordedWorkout(user.id, {
      ...input,
      title: "Changed",
      notes: "Changed",
      date: "2026-10-13",
    });
    assert.equal(retry.id, first.id);
    const original = await prisma.workout.findUniqueOrThrow({
      where: { id: first.id },
    });
    assert.equal(original.title, input.title);
    assert.equal(original.notes, input.notes);
    assert.equal(formatDateKey(original.date), input.date);
    assert.equal(original.state, "COMPLETED");
    const foreign = await createRecordedWorkout(other.id, input);
    assert.notEqual(foreign.id, first.id);
    assert.equal(
      (await prisma.workout.findUniqueOrThrow({ where: { id: foreign.id } }))
        .userId,
      other.id,
    );
    const distinct = await createRecordedWorkout(user.id, {
      ...input,
      key: randomUUID(),
    });
    assert.notEqual(distinct.id, first.id);
    const live = await startSession(user.id, {
      key,
      source: "workout",
      sourceId: first.id,
      date: input.date,
      restSeconds: 90,
    });
    assert.notEqual(live.id, first.id);
    assert.equal(live.state, "ACTIVE");
    assert.equal((await createRecordedWorkout(user.id, input)).id, first.id);
    for (const invalid of [undefined, "", "not-a-uuid", "x".repeat(200)]) {
      await assert.rejects(
        createRecordedWorkout(user.id, { ...input, key: invalid }),
      );
    }
    assert.equal(await prisma.workout.count({ where: { userId: user.id } }), 3);
    assert.equal(
      await prisma.workout.count({ where: { userId: other.id } }),
      1,
    );
  } finally {
    await prisma.user.deleteMany({
      where: { id: { in: [user.id, other.id] } },
    });
  }
});
