import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { viewSchemas } from "@narumitw/fitness-contracts";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";

assert.ok(process.env.DATABASE_URL, "Use the disposable API test runner");
const prefix = `progression-review-${randomUUID()}`;
const origin =
  process.env.NODE_ENV === "production"
    ? "https://localhost:8784"
    : "http://localhost:8784";
const app = createApp({ trustedOrigin: origin });

after(async () => {
  await prisma.user.deleteMany({ where: { username: { startsWith: prefix } } });
  await prisma.exercise.deleteMany({ where: { slug: { startsWith: prefix } } });
  await prisma.$disconnect();
});

async function fixture(state: "ACTIVE" | "PAUSED", workingCompleted: boolean) {
  const name = `${prefix}-${randomUUID()}`;
  const user = await prisma.user.create({
    data: { username: name, passwordHash: await hashPassword(name) },
  });
  const exercise = await prisma.exercise.create({
    data: { slug: name, defaultName: "Progression review press" },
  });
  const template = await prisma.workoutTemplate.create({
    data: {
      userId: user.id,
      title: "Progression review template",
      sets: {
        create: [
          {
            exerciseId: exercise.id,
            order: 1,
            weight: 20,
            reps: 10,
            type: "WARMUP",
          },
          { exerciseId: exercise.id, order: 2, weight: 80, reps: 8 },
          { exerciseId: exercise.id, order: 3, weight: 80, reps: 8 },
        ],
      },
      rules: { create: { exerciseId: exercise.id, increment: 2.5 } },
    },
  });
  const source = await prisma.workout.create({
    data: {
      userId: user.id,
      templateId: template.id,
      date: new Date(2020, 1, 29),
      state: "COMPLETED",
      sets: {
        create: [2, 3].map((order) => ({
          exerciseId: exercise.id,
          order,
          weight: 80,
          reps: 8,
          targetWeight: 80,
          targetReps: 8,
          completed: true,
        })),
      },
    },
  });
  const workout = await prisma.workout.create({
    data: {
      userId: user.id,
      templateId: template.id,
      date: new Date(2020, 2, 1),
      state,
      version: 4,
      sets: {
        create: [
          {
            exerciseId: exercise.id,
            order: 1,
            type: "WARMUP",
            weight: 20,
            reps: 10,
            targetWeight: 20,
            targetReps: 10,
            completed: true,
            actualsEntered: true,
          },
          ...[2, 3].map((order) => ({
            exerciseId: exercise.id,
            order,
            type: "WORKING",
            weight: workingCompleted && order === 2 ? 80 : 0,
            reps: workingCompleted && order === 2 ? 8 : 1,
            targetWeight: 80,
            targetReps: 8,
            completed: workingCompleted && order === 2,
            actualsEntered: workingCompleted && order === 2,
          })),
        ],
      },
    },
  });
  const token = randomUUID();
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
  return { workout, source, cookie: `fitness_session=${token}` };
}

for (const state of ["ACTIVE", "PAUSED"] as const) {
  for (const workingCompleted of [false, true]) {
    test(`${state}: completed warm-up ${workingCompleted ? "does not bypass a completed working set" : "allows the displayed progression suggestion"}`, async () => {
      const { workout, source, cookie } = await fixture(
        state,
        workingCompleted,
      );
      const detailResponse = await app.request(
        `/api/views/workouts/${workout.id}`,
        {
          headers: { cookie },
        },
      );
      assert.equal(detailResponse.status, 200);
      const detail = viewSchemas.workout.parse(await detailResponse.json());
      assert.equal(detail.previews.length, 1);
      const displayed = detail.previews[0];
      assert.equal(displayed.reason, "metTargets");
      assert.equal(displayed.sourceId, source.id);
      assert.equal(displayed.weight, 82.5);
      assert.equal(displayed.version, workout.version);
      const before = await prisma.workoutSet.findMany({
        where: { workoutId: workout.id },
        orderBy: { order: "asc" },
      });
      const response = await app.request(
        "/api/actions/acceptProgressionAction",
        {
          method: "POST",
          headers: { origin, cookie, "content-type": "application/json" },
          body: JSON.stringify({
            workoutId: workout.id,
            exerciseId: displayed.exerciseId,
            sourceId: displayed.sourceId,
            version: String(displayed.version),
            weight: String(displayed.weight),
          }),
        },
      );
      assert.equal(response.status, workingCompleted ? 409 : 200);
      const after = await prisma.workout.findUniqueOrThrow({
        where: { id: workout.id },
        include: { sets: { orderBy: { order: "asc" } } },
      });
      assert.equal(after.state, state);
      assert.equal(after.version, workout.version + (workingCompleted ? 0 : 1));
      assert.deepEqual(
        after.sets,
        before.map((set) => ({
          ...set,
          targetWeight:
            !workingCompleted && set.type === "WORKING"
              ? displayed.weight
              : set.targetWeight,
        })),
      );
      assert.equal(
        (await prisma.workout.findUniqueOrThrow({ where: { id: source.id } }))
          .version,
        source.version,
      );
    });
  }
}
