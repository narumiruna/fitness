import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { viewSchemas } from "@narumitw/fitness-contracts";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

assert.ok(process.env.DATABASE_URL, "Use the disposable API test runner");
const prefix = `ongoing-sessions-${randomUUID()}`;
const app = createApp({
  trustedOrigin:
    process.env.NODE_ENV === "production"
      ? "https://localhost:8784"
      : "http://localhost:8784",
});

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

async function view(cookie: string, query = "") {
  const response = await app.request(`/api/views/workouts${query}`, {
    headers: { cookie },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  const result = viewSchemas.workouts.parse(body);
  assert.deepEqual(body.ongoingSessions, result.ongoingSessions);
  return result;
}

after(async () => {
  await prisma.user.deleteMany({ where: { username: { startsWith: prefix } } });
  await prisma.exercise.deleteMany({ where: { slug: { startsWith: prefix } } });
  await prisma.$disconnect();
});

test("ongoing summaries are complete, private and independent of history filters and pages", async () => {
  const user = await owner("owner");
  const other = await owner("other");
  const exercise = await prisma.exercise.create({
    data: { slug: prefix, defaultName: prefix },
  });
  const paused = await prisma.workout.create({
    data: {
      userId: user.id,
      date: new Date(2020, 1, 29),
      title: "Older paused session",
      state: "PAUSED",
      updatedAt: new Date("2026-10-22T12:00:00Z"),
      sets: {
        create: [
          {
            exerciseId: exercise.id,
            order: 1,
            weight: 20,
            reps: 10,
            type: "WARMUP",
            completed: true,
          },
          {
            exerciseId: exercise.id,
            order: 2,
            weight: 50,
            reps: 8,
            completed: false,
          },
          {
            exerciseId: exercise.id,
            order: 3,
            weight: 50,
            reps: 8,
            completed: true,
          },
        ],
      },
    },
  });
  const active = await prisma.workout.create({
    data: {
      userId: user.id,
      date: new Date(2021, 0, 1),
      state: "ACTIVE",
      updatedAt: new Date("2026-10-21T12:00:00Z"),
      sets: {
        create: {
          exerciseId: exercise.id,
          order: 1,
          weight: 0,
          reps: 1,
          completed: false,
        },
      },
    },
  });
  // More than one history page of ongoing sessions must not be truncated.
  const emptyIds = Array.from(
    { length: 23 },
    (_, index) => `${prefix}-empty-${String(index).padStart(2, "0")}`,
  );
  await prisma.workout.createMany({
    data: [...emptyIds].reverse().map((id, index) => ({
      id,
      userId: user.id,
      date: new Date(2019, 0, 1),
      state: index % 2 ? "ACTIVE" : "PAUSED",
      updatedAt: new Date("2026-10-20T12:00:00Z"),
    })),
  });
  for (let day = 1; day <= 25; day++) {
    await prisma.workout.create({
      data: {
        userId: user.id,
        date: new Date(2026, 9, day),
        title: "History match",
        notes: "History notes",
        state: "COMPLETED",
        sets: {
          create: { exerciseId: exercise.id, order: 1, weight: 50, reps: 8 },
        },
      },
    });
  }
  await prisma.workout.create({
    data: { userId: user.id, date: new Date(2026, 9, 26), state: "ABANDONED" },
  });
  await prisma.workout.createMany({
    data: ["ACTIVE", "PAUSED"].map((state) => ({
      userId: other.id,
      date: new Date(2026, 9, 27),
      state,
    })),
  });
  const snapshot = () =>
    prisma.workout.findMany({
      where: { userId: { in: [user.id, other.id] } },
      include: { sets: { orderBy: { id: "asc" } } },
      orderBy: { id: "asc" },
    });
  const before = await snapshot();
  assert.equal((await app.request("/api/views/workouts")).status, 401);
  const first = await view(user.cookie);
  assert.equal(first.workouts.length, 20);
  assert.ok(!first.workouts.some((workout) => workout.id === paused.id));
  assert.equal(first.ongoingSessions.length, 25);
  assert.deepEqual(
    first.ongoingSessions.map((session) => session.id),
    [paused.id, active.id, ...emptyIds],
  );
  assert.deepEqual(first.ongoingSessions.slice(0, 2), [
    {
      id: paused.id,
      date: "2020-02-29",
      title: "Older paused session",
      state: "PAUSED",
      totalSets: 3,
      completedSets: 2,
    },
    {
      id: active.id,
      date: "2021-01-01",
      title: null,
      state: "ACTIVE",
      totalSets: 1,
      completedSets: 0,
    },
  ]);
  for (const session of first.ongoingSessions.slice(2)) {
    assert.equal(session.totalSets, 0);
    assert.equal(session.completedSets, 0);
  }
  const filters = new URLSearchParams({
    q: "History match",
    month: "2026-10",
    exercise: exercise.id,
    notes: "1",
  });
  for (const query of ["?page=2", `?${filters}`, `?${filters}&page=2`]) {
    const result = await view(user.cookie, query);
    assert.deepEqual(result.ongoingSessions, first.ongoingSessions);
    if (query.includes("page=2")) assert.equal(result.currentPage, 2);
    if (query.includes("month=")) {
      assert.equal(result.filteredWorkoutCount, 25);
      assert.equal(result.totalPages, 2);
      assert.ok(
        result.workouts.every((workout) => workout.state === "COMPLETED"),
      );
    }
  }
  filters.set("q", "No history matches");
  const emptyHistory = await view(user.cookie, `?${filters}&page=2`);
  assert.equal(emptyHistory.filteredWorkoutCount, 0);
  assert.deepEqual(emptyHistory.workouts, []);
  assert.deepEqual(emptyHistory.ongoingSessions, first.ongoingSessions);
  const foreignView = await view(other.cookie);
  assert.equal(foreignView.ongoingSessions.length, 2);
  assert.ok(
    foreignView.ongoingSessions.every(
      (session) => !first.ongoingSessions.some((own) => own.id === session.id),
    ),
  );
  assert.deepEqual(await snapshot(), before);
});
