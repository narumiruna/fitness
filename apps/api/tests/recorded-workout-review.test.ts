import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { viewSchemas } from "@narumitw/fitness-contracts";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

assert.ok(process.env.DATABASE_URL, "Use the disposable API test runner");
const prefix = `recorded-review-${randomUUID()}`;
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
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
  return { id: user.id, cookie: `fitness_session=${token}` };
}

async function post(name: string, fields: unknown, cookie: string) {
  return app.request(`/api/actions/${name}`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", cookie },
    body: JSON.stringify(fields),
  });
}

async function detail(id: string, cookie: string) {
  const response = await app.request(`/api/views/workouts/${id}`, {
    headers: { cookie },
  });
  assert.equal(response.status, 200);
  return viewSchemas.workout.parse(await response.json()).workout;
}

async function redirectedId(response: Response) {
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.match(result.redirect, /^\/workouts\//);
  return result.redirect.split("/").pop() as string;
}

after(async () => {
  await prisma.user.deleteMany({ where: { username: { startsWith: prefix } } });
  await prisma.exercise.deleteMany({ where: { slug: { startsWith: prefix } } });
  await prisma.$disconnect();
});

test("recorded workout review: text clearing, precision and skipped sets over HTTP", async (t) => {
  const user = await owner("owner");
  const other = await owner("other");
  const exercise = await prisma.exercise.create({
    data: { slug: prefix, defaultName: prefix },
  });
  const workout = await prisma.workout.create({
    data: {
      userId: user.id,
      date: new Date("2026-10-21T00:00:00"),
      title: "Original title",
      notes: "Original workout notes",
      sets: {
        create: [
          {
            exerciseId: exercise.id,
            order: 1,
            weight: 50.25,
            reps: 8,
            notes: "Original set notes",
            type: "WARMUP",
            rir: 1.5,
          },
          { exerciseId: exercise.id, order: 2, weight: 999, reps: 99 },
        ],
      },
    },
    include: { sets: { orderBy: { order: "asc" } } },
  });
  const workoutFields = { workoutId: workout.id, date: "2026-10-21" };
  const setFields = {
    workoutId: workout.id,
    setId: workout.sets[0].id,
    exerciseId: exercise.id,
    weight: "50.25",
    reps: "8",
    order: "1",
  };

  await t.test(
    "omitted text is retained and explicit empty or whitespace text clears after reload",
    async () => {
      assert.equal(
        (await post("updateWorkoutAction", workoutFields, user.cookie)).status,
        200,
      );
      assert.equal(
        (await post("updateWorkoutSetAction", setFields, user.cookie)).status,
        200,
      );
      let reloaded = await detail(workout.id, user.cookie);
      assert.equal(reloaded.title, "Original title");
      assert.equal(reloaded.notes, "Original workout notes");
      assert.equal(reloaded.sets[0].notes, "Original set notes");
      assert.equal(reloaded.sets[0].weight, 50.25);
      assert.equal(reloaded.sets[0].type, "WARMUP");
      assert.equal(reloaded.sets[0].rir, 1.5);

      for (const blank of ["", "   \n  "]) {
        assert.equal(
          (
            await post(
              "updateWorkoutAction",
              {
                ...workoutFields,
                title: "Restore title",
                notes: "Restore workout notes",
              },
              user.cookie,
            )
          ).status,
          200,
        );
        assert.equal(
          (
            await post(
              "updateWorkoutSetAction",
              {
                ...setFields,
                notes: "Restore set notes",
              },
              user.cookie,
            )
          ).status,
          200,
        );
        // Retry the same clear operation, as a browser can after a lost response.
        for (let attempt = 0; attempt < 2; attempt++) {
          assert.equal(
            (
              await post(
                "updateWorkoutAction",
                {
                  ...workoutFields,
                  title: blank,
                  notes: blank,
                },
                user.cookie,
              )
            ).status,
            200,
          );
          assert.equal(
            (
              await post(
                "updateWorkoutSetAction",
                {
                  ...setFields,
                  notes: blank,
                },
                user.cookie,
              )
            ).status,
            200,
          );
        }
        reloaded = await detail(workout.id, user.cookie);
        assert.equal(reloaded.title, "");
        assert.equal(reloaded.notes, "");
        assert.equal(reloaded.sets[0].notes, "");
      }
    },
  );

  await t.test(
    "authentication, Origin, ownership and text limits still reject writes",
    async () => {
      for (const [action, fields] of [
        [
          "updateWorkoutAction",
          { ...workoutFields, title: "unauthorized", notes: "" },
        ],
        ["updateWorkoutSetAction", { ...setFields, notes: "unauthorized" }],
        [
          "deleteWorkoutSetAction",
          { workoutId: workout.id, setId: setFields.setId },
        ],
      ] as const) {
        assert.equal((await post(action, fields, "")).status, 401);
        assert.equal((await post(action, fields, other.cookie)).status, 404);
        const forbidden = await app.request(`/api/actions/${action}`, {
          method: "POST",
          headers: {
            origin: "https://attacker.invalid",
            "content-type": "application/json",
            cookie: user.cookie,
          },
          body: JSON.stringify(fields),
        });
        assert.equal(forbidden.status, 403);
      }
      assert.equal(
        (
          await post(
            "updateWorkoutAction",
            {
              ...workoutFields,
              title: "x".repeat(121),
              notes: "",
            },
            user.cookie,
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await post(
            "updateWorkoutSetAction",
            {
              ...setFields,
              notes: "x".repeat(1001),
            },
            user.cookie,
          )
        ).status,
        400,
      );
      const reloaded = await detail(workout.id, user.cookie);
      assert.equal(reloaded.title, "");
      assert.equal(reloaded.sets[0].notes, "");
    },
  );

  await t.test(
    "live precision survives completion and retrospective edits do not perform skipped sets",
    async () => {
      const startFields = {
        source: "workout",
        sourceId: workout.id,
        date: "2026-10-22",
        key: randomUUID(),
        restSeconds: "0",
      };
      const liveId = await redirectedId(
        await post("startSessionAction", startFields, user.cookie),
      );
      assert.equal(
        await redirectedId(
          await post("startSessionAction", startFields, user.cookie),
        ),
        liveId,
      );
      const live = await detail(liveId, user.cookie);
      const liveSet = {
        ...setFields,
        workoutId: liveId,
        setId: live.sets[0].id,
        type: "WARMUP",
        rir: "1.5",
      };
      assert.equal(
        (await post("updateWorkoutSetAction", liveSet, user.cookie)).status,
        404,
      );
      assert.equal(
        (
          await post(
            "editSessionSetAction",
            {
              ...liveSet,
              version: "0",
              command: "complete",
            },
            user.cookie,
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await post(
            "changeSessionAction",
            {
              workoutId: liveId,
              version: "1",
              command: "finish",
              partial: "on",
            },
            user.cookie,
          )
        ).status,
        200,
      );
      let completed = await detail(liveId, user.cookie);
      assert.equal(completed.state, "COMPLETED");
      assert.equal(completed.sets[0].weight, 50.25);
      assert.equal(completed.sets[1].completed, false);
      assert.equal(completed.sets[1].actualsEntered, false);
      assert.equal(
        (
          await post(
            "updateWorkoutSetAction",
            {
              ...liveSet,
              weight: "50.251",
              notes: "precision retained",
            },
            user.cookie,
          )
        ).status,
        200,
      );
      completed = await detail(liveId, user.cookie);
      assert.equal(completed.sets[0].weight, 50.251);
      assert.equal(completed.sets[1].completed, false);
      assert.equal(completed.sets[1].actualsEntered, false);
      const copyId = await redirectedId(
        await post(
          "duplicateWorkoutAction",
          {
            sourceWorkoutId: liveId,
            date: "2026-10-23",
          },
          user.cookie,
        ),
      );
      const copy = await detail(copyId, user.cookie);
      assert.equal(copy.sets.length, 1);
      assert.equal(copy.sets[0].weight, 50.251);
      // Removing a skipped row is deliberate and does not change the performed set.
      assert.equal(
        (
          await post(
            "deleteWorkoutSetAction",
            {
              workoutId: liveId,
              setId: completed.sets[1].id,
            },
            user.cookie,
          )
        ).status,
        200,
      );
      completed = await detail(liveId, user.cookie);
      assert.equal(completed.sets.length, 1);
      assert.equal(completed.sets[0].weight, 50.251);
      assert.equal(completed.sets[0].completed, true);
    },
  );
});
