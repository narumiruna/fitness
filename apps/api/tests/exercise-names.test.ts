import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";
import { actionEnvelopeSchema } from "@narumitw/fitness-contracts";
import { createApp } from "../src/app.js";
import {
  exerciseHasName,
  normalizeExerciseAlias,
  slugifyExerciseName,
} from "../src/lib/exercises.js";
import { prisma } from "../src/lib/prisma.js";

const origin =
  process.env.NODE_ENV === "production"
    ? "https://localhost:8784"
    : "http://localhost:8784";
const app = createApp({ trustedOrigin: origin });

test("exercise name matching is independent of stable seed/import slugs", () => {
  for (const [name, slug] of [
    ["Squat", "squat"],
    ["  Bench Press  ", "bench-press"],
    ["Pull-up", "pull-up"],
    ["槓鈴划船", ""],
    ["Press 中文", "press"],
  ])
    assert.equal(slugifyExerciseName(name), slug);

  const exercise = {
    defaultName: "Renamed 硬舉",
    names: [{ name: "Original 深蹲" }, { name: "舊名稱" }],
  };
  for (const name of ["  RENAMED   硬舉 ", "original 深蹲", " 舊名稱 "])
    assert.ok(exerciseHasName(exercise, normalizeExerciseAlias(name)));
  assert.equal(
    exerciseHasName(exercise, normalizeExerciseAlias("新名稱")),
    false,
  );
  assert.ok(
    exerciseHasName(
      { defaultName: "Imported 動作", names: [] },
      normalizeExerciseAlias(" IMPORTED   動作 "),
    ),
  );
});

test("HTTP exercise creation separates duplicate names from slug collisions", async (t) => {
  assert.ok(process.env.DATABASE_URL, "Use the disposable API test runner");
  const key = `exercise-names-${randomUUID()}`;
  const userIds: string[] = [];
  t.after(async () => {
    try {
      await prisma.exercise.deleteMany({
        where: { createdByUserId: { in: userIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    } finally {
      await prisma.$disconnect();
    }
  });
  async function session(suffix: string, role = "USER") {
    const user = await prisma.user.create({
      data: {
        username: `${key}-${suffix}`,
        passwordHash: "$2b$12$not-used-for-authentication",
        role,
      },
    });
    userIds.push(user.id);
    const token = randomUUID();
    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    return { user, cookie: `fitness_session=${token}` };
  }
  const owner = await session("owner");
  const other = await session("other");
  const admin = await session("admin", "ADMIN");
  async function post(
    action: string,
    fields: Record<string, string>,
    cookie = owner.cookie,
    requestOrigin: string | null = origin,
  ) {
    return app.request(`/api/actions/${action}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie,
        ...(requestOrigin ? { origin: requestOrigin } : {}),
      },
      body: JSON.stringify(fields),
    });
  }
  async function create(defaultName: string) {
    const response = await post("createExerciseAction", { defaultName });
    assert.equal(response.status, 200);
    const result = actionEnvelopeSchema.parse(await response.json());
    assert.ok(result.redirect?.startsWith("/exercises?created="));
    const id = new URL(result.redirect, origin).searchParams.get("created");
    assert.ok(id);
    return prisma.exercise.findUniqueOrThrow({ where: { id } });
  }
  async function duplicate(defaultName: string) {
    const before = await prisma.exercise.count();
    const response = await post("createExerciseAction", { defaultName });
    assert.equal(response.status, 200);
    assert.equal(
      actionEnvelopeSchema.parse(await response.json()).redirect,
      "/exercises?error=duplicate",
    );
    assert.equal(await prisma.exercise.count(), before);
  }

  await t.test("distinct Chinese names and normalized duplicates", async () => {
    // Keep an old empty slug unchanged; new names must use nonempty identifiers.
    const legacy = await prisma.exercise.create({
      data: {
        slug: "",
        defaultName: "舊版動作",
        createdByUserId: owner.user.id,
      },
    });
    const squat = await create("測試深蹲");
    const deadlift = await create("測試硬舉");
    assert.ok(squat.slug);
    assert.ok(deadlift.slug);
    assert.notEqual(squat.slug, deadlift.slug);
    assert.equal(
      (await prisma.exercise.findUniqueOrThrow({ where: { id: legacy.id } }))
        .slug,
      "",
    );
    await duplicate("  測試深蹲  ");
    await duplicate("舊版動作");
    await create(`${key} Mixed 動作`);
    await duplicate(` ${key.toUpperCase()}   MIXED   動作 `);
  });

  await t.test(
    "mixed ASCII/Unicode and punctuation slug collisions are not duplicates",
    async () => {
      const ascii = await create(`${key} Press`);
      const first = await create(`${key} Press 中文`);
      const second = await create(`${key} Press 日文`);
      const punctuation = await create(`${key}-Press`);
      assert.equal(ascii.slug, `${key}-press`);
      assert.equal(
        new Set([ascii.slug, first.slug, second.slug, punctuation.slug]).size,
        4,
      );
      await duplicate(`${key} Press 中文`);
      await duplicate(`${key}-Press`);
    },
  );

  await t.test(
    "renamed, translated and alias-less imported names stay reserved",
    async () => {
      const original = await create(`${key} Original`);
      const renamed = `${key} Renamed`;
      const response = await post("updateExerciseAction", {
        exerciseId: original.id,
        defaultName: renamed,
      });
      assert.equal(response.status, 200);
      assert.equal(
        actionEnvelopeSchema.parse(await response.json()).redirect,
        `/exercises/${original.id}?saved=1#edit-exercise`,
      );
      await duplicate(renamed.toUpperCase());
      await duplicate(`${key} Original`);
      assert.equal(
        (
          await prisma.exercise.findUniqueOrThrow({
            where: { id: original.id },
          })
        ).slug,
        original.slug,
      );
      // CSV-created exercises can have a UUID slug and no name/alias records.
      const imported = await prisma.exercise.create({
        data: {
          slug: `${key}-import-${randomUUID()}`,
          defaultName: `${key} Imported 動作`,
          createdByUserId: owner.user.id,
        },
      });
      await duplicate(` ${key.toUpperCase()}   IMPORTED 動作 `);
      await prisma.exerciseName.create({
        data: {
          exerciseId: imported.id,
          locale: "zh-TW",
          name: `${key} 翻譯名稱`,
        },
      });
      await duplicate(`${key} 翻譯名稱`);
      await prisma.exerciseAlias.create({
        data: {
          exerciseId: imported.id,
          locale: "en",
          alias: `${key} Alias`,
          normalizedAlias: normalizeExerciseAlias(`${key} Alias`),
        },
      });
      await duplicate(`${key} Alias`);
      const conflict = await post("updateExerciseAction", {
        exerciseId: original.id,
        defaultName: imported.defaultName,
      });
      assert.equal(
        actionEnvelopeSchema.parse(await conflict.json()).redirect,
        `/exercises/${original.id}?error=duplicate#edit-exercise`,
      );
    },
  );

  await t.test(
    "authentication, mutation Origin and rename ownership are unchanged",
    async () => {
      const exercise = await create(`${key} Owned`);
      const fields = { exerciseId: exercise.id, defaultName: `${key} Changed` };
      for (const action of ["createExerciseAction", "updateExerciseAction"]) {
        assert.equal((await post(action, fields, "")).status, 401);
        for (const badOrigin of [null, "https://attacker.invalid"])
          assert.equal(
            (await post(action, fields, owner.cookie, badOrigin)).status,
            403,
          );
      }
      assert.equal(
        (await post("updateExerciseAction", fields, other.cookie)).status,
        403,
      );
      assert.equal(
        (
          await prisma.exercise.findUniqueOrThrow({
            where: { id: exercise.id },
          })
        ).defaultName,
        exercise.defaultName,
      );
      const response = await post("updateExerciseAction", fields, admin.cookie);
      assert.equal(response.status, 200);
      assert.equal(
        actionEnvelopeSchema.parse(await response.json()).redirect,
        `/exercises/${exercise.id}?saved=1#edit-exercise`,
      );
    },
  );
});
