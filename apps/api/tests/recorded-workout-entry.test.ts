import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, test } from "node:test";
import {
  actionEnvelopeSchema,
  formFailureSchema,
  viewSchemas,
} from "@narumitw/fitness-contracts";
import { formatDateKey } from "@narumitw/fitness-core/calendar";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

assert.ok(process.env.DATABASE_URL, "Use the disposable API test runner");
const prefix = `recorded-entry-${randomUUID()}`;
const origin =
  process.env.NODE_ENV === "production"
    ? "https://localhost:8784"
    : "http://localhost:8784";
const app = createApp({ trustedOrigin: origin });

async function owner(suffix: string) {
  const user = await prisma.user.create({
    data: { username: `${prefix}-${suffix}`, passwordHash: "unused-test-hash" },
  });
  const token = randomUUID();
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  });
  return { id: user.id, cookie: `fitness_session=${token}` };
}

function post(
  name: string,
  fields: unknown,
  cookie: string,
  requestOrigin = origin,
) {
  return app.request(`/api/actions/${name}`, {
    method: "POST",
    headers: {
      origin: requestOrigin,
      "content-type": "application/json",
      cookie,
    },
    body: JSON.stringify(fields),
  });
}

async function createWorkout(
  cookie: string,
  fields: Record<string, string> = {},
) {
  const response = await post(
    "createWorkoutAction",
    { key: randomUUID(), ...fields },
    cookie,
  );
  assert.equal(response.status, 200);
  const result = actionEnvelopeSchema.parse(await response.json());
  assert.match(result.redirect ?? "", /^\/workouts\//);
  return result.redirect?.split("/").pop() as string;
}

async function detail(workoutId: string, cookie: string) {
  const response = await app.request(`/api/views/workouts/${workoutId}`, {
    headers: { cookie },
  });
  assert.equal(response.status, 200);
  return viewSchemas.workout.parse(await response.json()).workout;
}

function snapshot(workoutId: string) {
  return prisma.workout.findUniqueOrThrow({
    where: { id: workoutId },
    include: { sets: { orderBy: { order: "asc" } } },
  });
}

after(async () => {
  await prisma.user.deleteMany({ where: { username: { startsWith: prefix } } });
  await prisma.exercise.deleteMany({ where: { slug: { startsWith: prefix } } });
  await prisma.$disconnect();
});

test("recorded entry defaults, append and exact atomic reorder over HTTP", async (t) => {
  const user = await owner("owner");
  const other = await owner("other");
  const exercise = await prisma.exercise.create({
    data: { slug: prefix, defaultName: prefix },
  });
  const setFields = { exerciseId: exercise.id, weight: "50.125", reps: "8" };

  await t.test(
    "omitted date uses today and idempotent retries retain the original",
    async () => {
      const before = formatDateKey(new Date());
      const key = randomUUID();
      const id = await createWorkout(user.cookie, { key });
      const workout = await detail(id, user.cookie);
      assert.ok([before, formatDateKey(new Date())].includes(workout.date));
      assert.equal(workout.title, null);
      assert.equal(workout.notes, null);
      assert.equal(workout.state, "COMPLETED");
      assert.deepEqual(workout.sets, []);
      assert.equal(
        await createWorkout(user.cookie, {
          key,
          date: "2026-10-20",
          title: "Changed",
          notes: "Changed",
        }),
        id,
      );
      assert.deepEqual(await detail(id, user.cookie), workout);
      const explicitId = await createWorkout(user.cookie, {
        date: "2026-10-20",
        title: "  Explicit title  ",
        notes: "  Explicit notes  ",
      });
      const explicit = await detail(explicitId, user.cookie);
      assert.equal(explicit.date, "2026-10-20");
      assert.equal(explicit.title, "Explicit title");
      assert.equal(explicit.notes, "Explicit notes");
      for (const fields of [
        { date: "" },
        { date: "2026-02-30" },
        { date: "invalid" },
        { key: "invalid" },
      ]) {
        const response = await post(
          "createWorkoutAction",
          { key: randomUUID(), ...fields },
          user.cookie,
        );
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), {
          result: { error: "invalidWorkoutInput" },
        });
      }
    },
  );

  await t.test(
    "append uses the locked maximum after gaps and concurrent writes",
    async () => {
      const workoutId = await createWorkout(user.cookie);
      for (let i = 0; i < 2; i++) {
        assert.equal(
          (
            await post(
              "createWorkoutSetAction",
              { workoutId, ...setFields },
              user.cookie,
            )
          ).status,
          200,
        );
      }
      let workout = await detail(workoutId, user.cookie);
      assert.deepEqual(
        workout.sets.map((set) => set.order),
        [1, 2],
      );
      assert.equal(workout.sets[0].weight, 50.125);
      assert.equal(workout.sets[0].type, "WORKING");
      assert.equal(workout.sets[0].rir, null);
      assert.equal(
        (
          await post(
            "deleteWorkoutSetAction",
            { workoutId, setId: workout.sets[0].id },
            user.cookie,
          )
        ).status,
        200,
      );
      const responses = await Promise.all(
        [0, 1].map(() =>
          post(
            "createWorkoutSetAction",
            { workoutId, ...setFields },
            user.cookie,
          ),
        ),
      );
      assert.deepEqual(
        responses.map((response) => response.status),
        [200, 200],
      );
      workout = await detail(workoutId, user.cookie);
      assert.deepEqual(
        workout.sets.map((set) => set.order),
        [2, 3, 4],
      );
      // Existing clients can still supply an explicit order.
      assert.equal(
        (
          await post(
            "createWorkoutSetAction",
            { workoutId, ...setFields, order: "8" },
            user.cookie,
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await post(
            "createWorkoutSetAction",
            { workoutId, ...setFields },
            user.cookie,
          )
        ).status,
        200,
      );
      assert.deepEqual(
        (await detail(workoutId, user.cookie)).sets.map((set) => set.order),
        [2, 3, 4, 8, 9],
      );
    },
  );

  await t.test(
    "reorder changes only order and rejects incomplete or foreign membership atomically",
    async () => {
      const workout = await prisma.workout.create({
        data: {
          userId: user.id,
          date: new Date("2026-10-20T00:00:00"),
          title: "Keep title",
          notes: "Keep notes",
          sets: {
            create: [1, 4, 7].map((order) => ({
              exerciseId: exercise.id,
              order,
              weight: 50.125,
              reps: 8,
              type: "WARMUP",
              rir: 1.5,
              notes: `Set ${order}`,
              completed: order !== 4,
              actualsEntered: order !== 4,
            })),
          },
        },
      });
      const foreign = await prisma.workout.create({
        data: {
          userId: other.id,
          date: new Date(),
          sets: {
            create: { exerciseId: exercise.id, order: 1, weight: 1, reps: 1 },
          },
        },
        include: { sets: true },
      });
      const before = await snapshot(workout.id);
      const ids = before.sets.map((set) => set.id);
      for (const setIds of [
        [ids[0], ids[0], ids[2]],
        ids.slice(1),
        [...ids, "unknown"],
        [ids[0], ids[1], foreign.sets[0].id],
        [ids[0], ids[1], "unknown"],
        [],
      ]) {
        const response = await post(
          "reorderWorkoutSetsAction",
          {
            workoutId: workout.id,
            version: "0",
            setIds,
          },
          user.cookie,
        );
        assert.equal(response.status, 400);
        assert.deepEqual(await snapshot(workout.id), before);
      }
      const setIds = [...ids].reverse();
      assert.equal(
        (
          await post(
            "reorderWorkoutSetsAction",
            { workoutId: workout.id, version: "0", setIds },
            user.cookie,
          )
        ).status,
        200,
      );
      const after = await snapshot(workout.id);
      assert.equal(after.version, 1);
      assert.deepEqual(
        after.sets,
        [...before.sets]
          .reverse()
          .map((set, index) => ({ ...set, order: index + 1 })),
      );
      assert.equal(after.title, before.title);
      assert.equal(after.notes, before.notes);
      assert.deepEqual(after.date, before.date);
      assert.deepEqual(
        (await detail(workout.id, user.cookie)).sets.map((set) => set.id),
        setIds,
      );
      assert.equal(
        (
          await post(
            "reorderWorkoutSetsAction",
            { workoutId: workout.id, version: "0", setIds: ids },
            user.cookie,
          )
        ).status,
        409,
      );
      assert.deepEqual(await snapshot(workout.id), after);
      const orders = [ids, [ids[1], ids[2], ids[0]]];
      const responses = await Promise.all(
        orders.map((setIds) =>
          post(
            "reorderWorkoutSetsAction",
            {
              workoutId: workout.id,
              version: "1",
              setIds,
            },
            user.cookie,
          ),
        ),
      );
      assert.deepEqual(
        responses.map((response) => response.status).sort(),
        [200, 409],
      );
      const winner = responses.findIndex((response) => response.status === 200);
      assert.deepEqual(
        (await detail(workout.id, user.cookie)).sets.map((set) => set.id),
        orders[winner],
      );
      assert.equal((await snapshot(workout.id)).version, 2);
      assert.equal(
        (
          await post(
            "createWorkoutSetAction",
            { workoutId: workout.id, ...setFields },
            user.cookie,
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await post(
            "reorderWorkoutSetsAction",
            { workoutId: workout.id, version: "2", setIds: orders[winner] },
            user.cookie,
          )
        ).status,
        409,
      );
      const appended = await snapshot(workout.id);
      assert.equal(
        (
          await post(
            "reorderWorkoutSetsAction",
            { workoutId: workout.id, version: "3", setIds: orders[winner] },
            user.cookie,
          )
        ).status,
        400,
      );
      assert.deepEqual(await snapshot(workout.id), appended);
    },
  );

  await t.test(
    "result edits ignore stale hidden order after a committed reorder",
    async () => {
      const workout = await prisma.workout.create({
        data: {
          userId: user.id,
          date: new Date(),
          sets: {
            create: [1, 2, 3].map((order) => ({
              exerciseId: exercise.id,
              order,
              weight: 50.125,
              reps: 8,
            })),
          },
        },
      });
      const before = await snapshot(workout.id);
      const edited = before.sets[0];
      const setIds = before.sets.map((set) => set.id).reverse();
      assert.equal(
        (
          await post(
            "reorderWorkoutSetsAction",
            { workoutId: workout.id, version: "0", setIds },
            user.cookie,
          )
        ).status,
        200,
      );
      const reordered = await snapshot(workout.id);
      assert.equal(
        (
          await post(
            "updateWorkoutSetAction",
            {
              workoutId: workout.id,
              setId: edited.id,
              ...setFields,
              order: String(edited.order),
              weight: "60.25",
            },
            user.cookie,
          )
        ).status,
        200,
      );
      const after = await snapshot(workout.id);
      assert.equal(after.version, reordered.version + 1);
      assert.deepEqual(
        after.sets,
        reordered.sets.map((set) =>
          set.id === edited.id ? { ...set, weight: 60.25 } : set,
        ),
      );
      const visible = await detail(workout.id, user.cookie);
      assert.deepEqual(
        visible.sets.map((set) => set.id),
        setIds,
      );
      assert.deepEqual(
        visible.sets.map((set) => set.order),
        [1, 2, 3],
      );
      assert.equal(visible.sets[2].weight, 60.25);
    },
  );

  await t.test(
    "reorder requires a nonempty version without writes",
    async () => {
      const workoutId = await createWorkout(user.cookie);
      const before = await snapshot(workoutId);
      for (const version of [
        undefined,
        null,
        "",
        "   ",
        false,
        "-1",
        "0.5",
        "invalid",
      ]) {
        assert.equal(
          (
            await post(
              "reorderWorkoutSetsAction",
              { workoutId, version, setIds: [] },
              user.cookie,
            )
          ).status,
          400,
        );
        assert.deepEqual(await snapshot(workoutId), before);
      }
      assert.equal(
        (
          await post(
            "reorderWorkoutSetsAction",
            { workoutId, version: "0", setIds: [] },
            user.cookie,
          )
        ).status,
        200,
      );
      assert.equal((await snapshot(workoutId)).version, 1);
    },
  );

  await t.test("full lists over 64 IDs and empty workouts", async () => {
    const workout = await prisma.workout.create({
      data: {
        userId: user.id,
        date: new Date(),
        sets: {
          create: Array.from({ length: 65 }, (_, index) => ({
            exerciseId: exercise.id,
            order: index + 1,
            weight: 1,
            reps: 1,
          })),
        },
      },
      include: { sets: { orderBy: { order: "asc" } } },
    });
    const setIds = workout.sets.map((set) => set.id).reverse();
    assert.equal(
      (
        await post(
          "reorderWorkoutSetsAction",
          { workoutId: workout.id, version: "0", setIds },
          user.cookie,
        )
      ).status,
      200,
    );
    assert.deepEqual(
      (await detail(workout.id, user.cookie)).sets.map((set) => set.id),
      setIds,
    );
    const emptyId = await createWorkout(user.cookie);
    assert.equal(
      (
        await post(
          "reorderWorkoutSetsAction",
          { workoutId: emptyId, version: "0", setIds: [] },
          user.cookie,
        )
      ).status,
      200,
    );
    assert.equal((await snapshot(emptyId)).version, 1);
  });

  await t.test(
    "automatic append normalizes sparse orders but explicit orders do not",
    async () => {
      for (const orders of [[1000], [4, 998, 1000]]) {
        const workout = await prisma.workout.create({
          data: {
            userId: user.id,
            date: new Date(),
            sets: {
              create: orders.map((order) => ({
                exerciseId: exercise.id,
                order,
                weight: 1,
                reps: 1,
              })),
            },
          },
        });
        const before = await snapshot(workout.id);
        if (orders.length > 1) {
          assert.equal(
            (
              await post(
                "createWorkoutSetAction",
                { workoutId: workout.id, ...setFields, order: "500" },
                user.cookie,
              )
            ).status,
            200,
          );
          const explicit = await snapshot(workout.id);
          assert.deepEqual(
            explicit.sets.filter((set) =>
              before.sets.some(({ id }) => id === set.id),
            ),
            before.sets,
          );
          assert.equal(
            explicit.sets.find((set) => set.order === 500)?.weight,
            50.125,
          );
        }
        const current = await snapshot(workout.id);
        assert.equal(
          (
            await post(
              "createWorkoutSetAction",
              { workoutId: workout.id, ...setFields },
              user.cookie,
            )
          ).status,
          200,
        );
        const after = await snapshot(workout.id);
        assert.equal(after.version, current.version + 1);
        assert.deepEqual(
          after.sets.slice(0, -1),
          current.sets.map((set, index) => ({ ...set, order: index + 1 })),
        );
        assert.deepEqual(
          after.sets.map((set) => set.order),
          Array.from(
            { length: current.sets.length + 1 },
            (_, index) => index + 1,
          ),
        );
        assert.equal(after.sets.at(-1)?.weight, 50.125);
      }
    },
  );

  await t.test(
    "automatic append at full capacity rolls back without partial writes",
    async () => {
      const full = await prisma.workout.create({
        data: {
          userId: user.id,
          date: new Date(),
          sets: {
            create: Array.from({ length: 1000 }, (_, index) => ({
              exerciseId: exercise.id,
              order: index + 1,
              weight: 1,
              reps: 1,
            })),
          },
        },
      });
      const before = await snapshot(full.id);
      assert.equal(
        (
          await post(
            "createWorkoutSetAction",
            { workoutId: full.id, ...setFields },
            user.cookie,
          )
        ).status,
        400,
      );
      assert.deepEqual(await snapshot(full.id), before);
    },
  );

  await t.test(
    "authentication, Origin, ownership and completed state guard writes",
    async () => {
      const workoutId = await createWorkout(user.cookie);
      const actions = [
        ["createWorkoutAction", { key: randomUUID() }],
        ["createWorkoutSetAction", { workoutId, ...setFields }],
        ["reorderWorkoutSetsAction", { workoutId, version: "0", setIds: [] }],
        [
          "createExerciseOptionAction",
          { defaultName: `${prefix}-unauthorized` },
        ],
      ] as const;
      const before = await snapshot(workoutId);
      for (const [action, fields] of actions) {
        assert.equal((await post(action, fields, "")).status, 401);
        assert.equal(
          (await post(action, fields, user.cookie, "https://attacker.invalid"))
            .status,
          403,
        );
      }
      for (const [action, fields] of actions.slice(1, 3)) {
        assert.equal((await post(action, fields, other.cookie)).status, 404);
      }
      assert.deepEqual(await snapshot(workoutId), before);
      for (const state of ["ACTIVE", "PAUSED", "ABANDONED"]) {
        await prisma.workout.update({
          where: { id: workoutId },
          data: { state },
        });
        for (const [action, fields] of actions.slice(1, 3)) {
          assert.equal((await post(action, fields, user.cookie)).status, 404);
        }
        const unchanged = await snapshot(workoutId);
        assert.equal(unchanged.version, 0);
        assert.deepEqual(unchanged.sets, []);
      }
    },
  );

  await t.test(
    "inline exercise creation returns only an option and safe duplicate failure",
    async () => {
      const defaultName = `${prefix} 槓鈴划船`;
      const response = await post(
        "createExerciseOptionAction",
        { defaultName: `  ${defaultName}  ` },
        user.cookie,
      );
      assert.equal(response.status, 200);
      const envelope = actionEnvelopeSchema.parse(await response.json());
      assert.equal(envelope.redirect, undefined);
      const created = await prisma.exercise.findFirstOrThrow({
        where: { defaultName },
      });
      assert.deepEqual(envelope.result, { id: created.id, defaultName });
      assert.equal(created.createdByUserId, user.id);
      assert.equal(
        await prisma.exerciseName.count({
          where: {
            exerciseId: created.id,
            locale: "en",
            name: defaultName,
            isPrimary: true,
          },
        }),
        1,
      );
      assert.equal(
        await prisma.exerciseAlias.count({ where: { exerciseId: created.id } }),
        1,
      );
      const duplicate = await post(
        "createExerciseOptionAction",
        { defaultName: defaultName.toUpperCase() },
        other.cookie,
      );
      assert.equal(duplicate.status, 200);
      const failure = actionEnvelopeSchema.parse(await duplicate.json());
      assert.deepEqual(formFailureSchema.parse(failure.result), {
        error: "duplicateExercise",
      });
      assert.equal(failure.redirect, undefined);
      const legacy = await post(
        "createExerciseAction",
        { defaultName },
        user.cookie,
      );
      assert.deepEqual(await legacy.json(), {
        redirect: "/exercises?error=duplicate",
      });
      const collisionName = `${prefix} 槓鈴推舉`;
      const collision = await post(
        "createExerciseOptionAction",
        { defaultName: collisionName },
        user.cookie,
      );
      assert.equal(collision.status, 200);
      const second = await prisma.exercise.findFirstOrThrow({
        where: { defaultName: collisionName },
      });
      assert.notEqual(second.slug, created.slug);
      assert.deepEqual(await collision.json(), {
        result: { id: second.id, defaultName: collisionName },
      });
      for (const defaultName of ["", " ", "x".repeat(121)]) {
        assert.equal(
          (
            await post(
              "createExerciseOptionAction",
              { defaultName },
              user.cookie,
            )
          ).status,
          400,
        );
      }
    },
  );
});
