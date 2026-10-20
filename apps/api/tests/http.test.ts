import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, test } from "node:test";
import {
  actionEnvelopeSchema,
  apiErrorSchema,
  bootstrapSchema,
  viewSchemas,
} from "@narumitw/fitness-contracts";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";
import { serializeWorkouts } from "../src/lib/workout-csv.js";

assert.ok(process.env.DATABASE_URL, "Use the disposable API test runner");
const origin =
  process.env.NODE_ENV === "production"
    ? "https://localhost:8784"
    : "http://localhost:8784";
const app = createApp({ trustedOrigin: origin });
let cookie = "";
async function post(name: string, fields: unknown = {}, auth = cookie) {
  return app.request(`/api/actions/${name}`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", cookie: auth },
    body: JSON.stringify(fields),
  });
}
async function view(name: string, auth = cookie) {
  return app.request(`/api/views/${name}`, { headers: { cookie: auth } });
}
function sessionCookie(response: Response) {
  const raw = response.headers
    .getSetCookie()
    .find((c) => c.startsWith("fitness_session="));
  assert.ok(raw);
  return raw.split(";")[0];
}
function workoutId(response: { redirect?: string }) {
  assert.ok(response.redirect?.startsWith("/workouts/"));
  return response.redirect.split("/").pop() as string;
}
after(async () => {
  await prisma.$disconnect();
});

test("HTTP security, features, safe page DTOs, sessions and CSV", async (t) => {
  await t.test("anonymous bootstrap and mutation security", async () => {
    const initial = await app.request("/api/bootstrap");
    assert.equal(initial.status, 200);
    bootstrapSchema.parse(await initial.json());
    for (const name of [
      "loginAction",
      "setupAdminAction",
      "setLocaleAction",
      "passkeyAuthenticationOptions",
    ]) {
      for (const badOrigin of [undefined, "https://attacker.invalid"]) {
        const response = await app.request(`/api/actions/${name}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(badOrigin ? { origin: badOrigin } : {}),
          },
          body: "{}",
        });
        assert.equal(response.status, 403);
        apiErrorSchema.parse(await response.json());
      }
    }
    assert.equal(
      (
        await app.request("/api/actions/loginAction", {
          method: "POST",
          headers: { origin, "content-type": "application/json" },
          body: "{",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await app.request("/api/actions/loginAction", {
          method: "POST",
          headers: {
            origin,
            "content-type": "application/x-www-form-urlencoded",
          },
          body: "username=test",
        })
      ).status,
      415,
    );
    assert.equal(
      (
        await app.request("/api/actions/loginAction", {
          method: "POST",
          headers: {
            origin,
            "content-type": "application/json",
            "content-length": "1",
          },
          body: JSON.stringify({ padding: "x".repeat(1024 * 1024) }),
        })
      ).status,
      413,
    );
    assert.equal((await view("workouts", "")).status, 401);
    assert.equal((await app.request("/api/no-such-route")).status, 404);
    assert.equal(
      (
        await app.request("/api/bootstrap", {
          method: "PATCH",
          headers: { origin },
        })
      ).status,
      405,
    );
  });
  await t.test(
    "production normalizes configured origin, not request origins",
    async () => {
      const previousMode = process.env.NODE_ENV;
      const previousOrigin = process.env.PASSKEY_ORIGIN;
      try {
        process.env.NODE_ENV = "production";
        const canonical = "https://localhost:8784";
        for (const suffix of ["/", "///"]) {
          process.env.PASSKEY_ORIGIN = `${canonical}${suffix}`;
          const productionApp = createApp();
          for (const action of [
            "setLocaleAction",
            "passkeyAuthenticationOptions",
          ]) {
            const request = (requestOrigin: string, extraHeaders = {}) =>
              productionApp.request(`/api/actions/${action}`, {
                method: "POST",
                headers: {
                  origin: requestOrigin,
                  "content-type": "application/json",
                  ...extraHeaders,
                },
                body: JSON.stringify(
                  action === "setLocaleAction" ? { locale: "en" } : {},
                ),
              });
            const accepted = await request(canonical);
            assert.equal(accepted.status, 200);
            if (action === "passkeyAuthenticationOptions") {
              const data = actionEnvelopeSchema.parse(await accepted.json());
              assert.equal((data.result as { rpId: string }).rpId, "localhost");
              assert.ok(
                accepted.headers
                  .getSetCookie()
                  .some((value) =>
                    value.startsWith("fitness_passkey_challenge="),
                  ),
              );
            }
            for (const rejected of [
              `${canonical}/`,
              `${canonical}/path`,
              "http://localhost:8784",
              "https://localhost:8785",
              "https://attacker.invalid",
            ])
              assert.equal(
                (
                  await request(rejected, {
                    "x-forwarded-host": "localhost:8784",
                    "x-forwarded-proto": "https",
                  })
                ).status,
                403,
              );
            assert.equal(
              (await request(canonical, { "sec-fetch-site": "cross-site" }))
                .status,
              403,
            );
          }
        }
      } finally {
        if (previousMode === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousMode;
        if (previousOrigin === undefined) delete process.env.PASSKEY_ORIGIN;
        else process.env.PASSKEY_ORIGIN = previousOrigin;
        await prisma.passkeyChallenge.deleteMany();
      }
    },
  );
  await t.test("locale cookie and development origin isolation", async () => {
    const resolved = await app.request("/api/bootstrap", {
      headers: { "accept-language": "zh-HK,zh;q=0.8,en;q=0.5" },
    });
    assert.equal((await resolved.json()).locale, "zh-TW");
    const changed = await post("setLocaleAction", { locale: "zh-TW" }, "");
    assert.equal(changed.status, 200);
    assert.match(changed.headers.get("set-cookie") ?? "", /HttpOnly/i);
    const localeCookie = changed.headers.getSetCookie()[0].split(";")[0];
    assert.equal(
      (
        await (
          await app.request("/api/bootstrap", {
            headers: { cookie: localeCookie, "accept-language": "en" },
          })
        ).json()
      ).locale,
      "zh-TW",
    );
    if (process.env.NODE_ENV !== "production") {
      // The runner sets an inherited production PASSKEY_ORIGIN.
      const plain = createApp();
      assert.equal(
        (
          await plain.request("/api/actions/setLocaleAction", {
            method: "POST",
            headers: {
              origin: "http://localhost:8784",
              "content-type": "application/json",
            },
            body: JSON.stringify({ locale: "en" }),
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await plain.request("/api/actions/setLocaleAction", {
            method: "POST",
            headers: {
              origin: "https://localhost:8784",
              "content-type": "application/json",
            },
            body: JSON.stringify({ locale: "en" }),
          })
        ).status,
        403,
      );
    }
  });
  await t.test("setup then existing session compatibility", async () => {
    if ((await prisma.user.count()) === 0) {
      const responses = await Promise.all([
        post("setupAdminAction", {
          username: "http-admin",
          password: "password123",
        }),
        post("setupAdminAction", {
          username: "http-admin-racer",
          password: "password123",
        }),
      ]);
      assert.equal(await prisma.user.count(), 1);
      for (const response of responses)
        assert.ok(
          [200, 409].includes(response.status),
          await response.clone().text(),
        );
      const response = responses.find((response) =>
        response.headers
          .getSetCookie()
          .some((value) => value.startsWith("fitness_session=")),
      );
      assert.ok(response);
      cookie = sessionCookie(response);
    } else {
      const user = await prisma.user.create({
        data: {
          username: `http-admin-${randomUUID()}`,
          passwordHash: await hashPassword("password123"),
          role: "ADMIN",
        },
      });
      const token = randomUUID();
      await prisma.session.create({
        data: {
          userId: user.id,
          tokenHash: createHash("sha256").update(token).digest("hex"),
          expiresAt: new Date(Date.now() + 60000),
        },
      });
      cookie = `fitness_session=${token}`;
    }
    const response = await app.request("/api/bootstrap", {
      headers: { cookie },
    });
    const data = bootstrapSchema.parse(await response.json());
    assert.equal(data.user?.role, "ADMIN");
    assert.equal(data.hasUsers, true);
    assert.doesNotMatch(JSON.stringify(data), /passwordHash|tokenHash/);
  });
  const other = await prisma.user.create({
    data: {
      username: `http-other-${randomUUID()}`,
      passwordHash: await hashPassword("password123"),
    },
  });
  await t.test(
    "pre-existing hashed session format and expiry remain compatible",
    async () => {
      const token = randomUUID();
      const legacy = await prisma.session.create({
        data: {
          userId: other.id,
          tokenHash: createHash("sha256").update(token).digest("hex"),
          expiresAt: new Date(Date.now() + 60000),
        },
      });
      const legacyCookie = `fitness_session=${token}`;
      const response = await app.request("/api/bootstrap", {
        headers: { cookie: legacyCookie },
      });
      assert.equal(
        bootstrapSchema.parse(await response.json()).user?.id,
        other.id,
      );
      await prisma.session.update({
        where: { id: legacy.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const expired = await app.request("/api/bootstrap", {
        headers: { cookie: legacyCookie },
      });
      assert.equal(bootstrapSchema.parse(await expired.json()).user, null);
      assert.equal(
        await prisma.session.findUnique({ where: { id: legacy.id } }),
        null,
      );
    },
  );
  const otherLogin = await post(
    "loginAction",
    { username: other.username, password: "password123" },
    "",
  );
  const otherCookie = sessionCookie(otherLogin);
  await t.test(
    "empty-account pages serialize zero aggregates safely",
    async () => {
      for (const name of [
        "workouts",
        "stats",
        "calendar",
        "exercises",
        "measurements",
        "passkeys",
        "dashboard",
        "data",
      ] as const) {
        const response = await view(name, otherCookie);
        assert.equal(
          response.status,
          200,
          `${name}: ${await response.clone().text()}`,
        );
        viewSchemas[name].parse(await response.json());
      }
      const empty = viewSchemas.workouts.parse(
        await (await view("workouts", otherCookie)).json(),
      );
      assert.deepEqual(empty.totals, [{ count: 0, volume: 0 }]);
      assert.equal(empty.totalWorkoutCount, 0);
    },
  );
  let exerciseId = "";
  let id = "";
  let templateId = "";
  await t.test("exercise, aliases, metadata and permissions", async () => {
    const created = await post("createExerciseAction", {
      defaultName: `HTTP Press ${randomUUID()}`,
    });
    assert.equal(created.status, 200);
    const exercises = await view("exercises");
    const data = viewSchemas.exercises.parse(await exercises.json());
    exerciseId = data.exercises.at(-1)?.id as string;
    assert.ok(exerciseId);
    assert.equal(
      (
        await post("createExerciseAliasAction", {
          exerciseId,
          locale: "en",
          alias: `http alias ${randomUUID()}`,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await post("saveMetadataAction", {
          exerciseId,
          primary: ["chest"],
          secondary: [],
          equipment: ["barbell"],
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await post(
          "saveMetadataAction",
          { exerciseId, primary: ["chest"], secondary: [], equipment: [] },
          otherCookie,
        )
      ).status,
      403,
    );
    const detail = await view(`exercises/${exerciseId}`);
    viewSchemas.exercise.parse(await detail.json());
  });
  await t.test(
    "stable workout create, sets, ownership and page filters",
    async () => {
      const fields = {
        key: randomUUID(),
        date: "2026-10-20",
        title: "HTTP workout",
        notes: "test",
      };
      const first = await post("createWorkoutAction", fields);
      assert.equal(first.status, 200);
      id = workoutId(actionEnvelopeSchema.parse(await first.json()));
      const retry = await post("createWorkoutAction", fields);
      assert.equal(workoutId(await retry.json()), id);
      assert.equal(
        (
          await post("createWorkoutSetAction", {
            workoutId: id,
            exerciseId,
            weight: "50",
            reps: "8",
            order: "1",
            type: "WORKING",
          })
        ).status,
        200,
      );
      const detail = await view(`workouts/${id}`);
      const data = viewSchemas.workout.parse(await detail.json());
      assert.equal(data.workout.date, "2026-10-20");
      assert.equal(data.workout.sets.length, 1);
      assert.doesNotMatch(
        JSON.stringify(data),
        /fingerprint|startKey|passwordHash|tokenHash/,
      );
      assert.equal((await view(`workouts/${id}`, otherCookie)).status, 404);
      assert.equal(
        (
          await post(
            "createWorkoutSetAction",
            { workoutId: id, exerciseId, weight: "1", reps: "1", order: "2" },
            otherCookie,
          )
        ).status,
        404,
      );
      const listed = await view("workouts?q=HTTP&month=2026-10&notes=1");
      const list = viewSchemas.workouts.parse(await listed.json());
      assert.ok(list.workouts.some((w) => w.id === id));
    },
  );
  await t.test("template planning and versioned training", async () => {
    assert.equal(
      (
        await post("saveWorkoutTemplateAction", {
          workoutId: id,
          title: "HTTP template",
        })
      ).status,
      200,
    );
    const plans = viewSchemas.workouts.parse(
      await (await view("workouts")).json(),
    );
    templateId = plans.templates.find((x) => x.title === "HTTP template")
      ?.id as string;
    assert.ok(templateId);
    assert.equal(
      (
        await post("saveProgressionRuleAction", {
          templateId,
          exerciseId,
          increment: "2.5",
        })
      ).status,
      200,
    );
    assert.equal(
      (await post("saveScheduleAction", { templateId, weekday: "1" })).status,
      200,
    );
    const input = {
      source: "template",
      sourceId: templateId,
      date: "2026-10-21",
      key: randomUUID(),
      restSeconds: "30",
    };
    const started = await post("startSessionAction", input);
    assert.equal(started.status, 200);
    const activeId = workoutId(await started.json());
    const retry = await post("startSessionAction", input);
    assert.equal(workoutId(await retry.json()), activeId);
    const active = viewSchemas.workout.parse(
      await (await view(`workouts/${activeId}`)).json(),
    );
    assert.equal(active.workout.state, "ACTIVE");
    assert.equal(active.workout.sets[0].actualsEntered, false);
    const changed = await post("changeSessionAction", {
      workoutId: activeId,
      version: "0",
      command: "pause",
    });
    assert.equal(changed.status, 200);
    const stale = await post("changeSessionAction", {
      workoutId: activeId,
      version: "0",
      command: "resume",
    });
    assert.deepEqual(await stale.json(), {
      result: { error: "sessionConflict" },
    });
    assert.equal(
      (
        await post("changeSessionAction", {
          workoutId: activeId,
          version: "1",
          command: "abandon",
        })
      ).status,
      200,
    );
  });
  await t.test(
    "remaining workout, catalog, admin and session mutations",
    async () => {
      const detail = viewSchemas.workout.parse(
        await (await view(`workouts/${id}`)).json(),
      );
      const setId = detail.workout.sets[0].id;
      const setFields = {
        workoutId: id,
        setId,
        exerciseId,
        weight: "52.5",
        reps: "8",
        order: "1",
        type: "WORKING",
        rir: "2",
        notes: "updated",
      };
      assert.equal(
        (await post("updateWorkoutSetAction", setFields)).status,
        200,
      );
      assert.equal(
        (
          await post("updateWorkoutAction", {
            workoutId: id,
            date: "2026-10-20",
            title: "HTTP updated",
            notes: "notes",
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await post("updateExerciseAction", {
            exerciseId,
            defaultName: `HTTP renamed ${randomUUID()}`,
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await post("createUserAction", {
            username: `HTTP-new-${randomUUID()}`,
            password: "new-password",
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await post(
            "createUserAction",
            { username: "not-permitted", password: "password" },
            otherCookie,
          )
        ).status,
        403,
      );
      for (const [action, fields] of [
        ["duplicateWorkoutAction", { sourceWorkoutId: id, date: "2026-10-23" }],
        ["createWorkoutFromTemplateAction", { templateId, date: "2026-10-24" }],
      ] as const) {
        const copied = await post(action, fields);
        assert.equal(copied.status, 200);
        const copyId = workoutId(await copied.json());
        assert.equal(
          (await post("deleteWorkoutAction", { workoutId: copyId })).status,
          200,
        );
      }
      const start = await post("startSessionAction", {
        source: "template",
        sourceId: templateId,
        date: "2026-10-25",
        key: randomUUID(),
        restSeconds: "0",
      });
      const sessionId = workoutId(await start.json());
      const active = viewSchemas.workout.parse(
        await (await view(`workouts/${sessionId}`)).json(),
      );
      const activeSet = active.workout.sets[0];
      const actuals = {
        workoutId: sessionId,
        setId: activeSet.id,
        exerciseId,
        weight: "50",
        reps: "8",
        rir: "1",
        notes: "actual",
        order: String(activeSet.order),
        type: activeSet.type,
        version: "0",
      };
      assert.equal((await post("editSessionSetAction", actuals)).status, 200);
      assert.equal(
        (
          await post("editSessionSetAction", {
            ...actuals,
            version: "1",
            command: "complete",
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await post("changeSessionAction", {
            workoutId: sessionId,
            version: "2",
            command: "finish",
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await post("acceptProgressionAction", {
            workoutId: sessionId,
            exerciseId,
            version: "3",
            sourceId: id,
            weight: "52.5",
          })
        ).status,
        409,
      );
      assert.equal(
        (await post("deleteWorkoutSetAction", { workoutId: id, setId })).status,
        200,
      );
      const finished = viewSchemas.workout.parse(
        await (await view(`workouts/${sessionId}`)).json(),
      );
      assert.equal(finished.workout.state, "COMPLETED");
      assert.equal(finished.workout.sets[0].actualsEntered, true);
    },
  );
  await t.test("measurements upsert, goals, all remaining views", async () => {
    for (const weight of ["80", "79"])
      assert.equal(
        (
          await post("saveMeasurementAction", {
            date: "2026-10-20",
            weight,
            waist: "",
          })
        ).status,
        200,
      );
    assert.equal((await post("saveGoalAction", { weight: "75" })).status, 200);
    const records = viewSchemas.measurements.parse(
      await (await view("measurements")).json(),
    );
    assert.equal(
      records.records.filter((r) => r.date === "2026-10-20").length,
      1,
    );
    for (const name of [
      "stats",
      "calendar",
      "users",
      "passkeys",
      "dashboard",
      "data",
    ] as const) {
      const response = await view(name);
      assert.equal(
        response.status,
        200,
        `${name}: ${await response.clone().text()}`,
      );
      viewSchemas[name].parse(await response.json());
    }
    const fresh = await view("workouts/new?date=2026-10-22");
    assert.equal(
      viewSchemas.new.parse(await fresh.json()).initialDate,
      "2026-10-22",
    );
    assert.equal((await view("users", otherCookie)).status, 403);
  });
  await t.test(
    "CSV multipart preview, atomic confirmation, download",
    async () => {
      const csv = serializeWorkouts([
        {
          key: "csv-1",
          date: "2026-10-22",
          title: "HTTP import",
          notes: null,
          state: "COMPLETED",
          activeSeconds: 0,
          templateTitle: null,
          sets: [],
        },
      ]);
      for (const action of [
        "previewImportAction",
        "confirmImportAction",
        "confirmImportAction",
      ]) {
        const body = new FormData();
        body.set("file", new File([csv], "workouts.csv", { type: "text/csv" }));
        body.set("mappings", "{}");
        const response = await app.request(`/api/actions/${action}`, {
          method: "POST",
          headers: { origin, cookie },
          body,
        });
        assert.equal(response.status, 200, await response.clone().text());
      }
      const response = await app.request("/data/export", {
        headers: { cookie },
      });
      assert.equal(response.status, 200);
      assert.match(
        response.headers.get("content-disposition") ?? "",
        /fitness-workouts-v1.csv/,
      );
      assert.match(await response.text(), /"version","workout_key"/);
    },
  );
  await t.test(
    "passkey origin, one-time challenge, replacement and capacity",
    async () => {
      const challenge = await post("passkeyAuthenticationOptions");
      assert.equal(challenge.status, 200);
      assert.ok(
        challenge.headers
          .getSetCookie()
          .some((c) => c.includes("fitness_passkey_challenge=")),
      );
      const before = await prisma.passkeyChallenge.count();
      const oldCookie = challenge.headers
        .getSetCookie()
        .find((c) => c.startsWith("fitness_passkey_challenge="))
        ?.split(";")[0];
      const replacement = await post(
        "passkeyAuthenticationOptions",
        {},
        oldCookie,
      );
      assert.equal(replacement.status, 200);
      assert.equal(await prisma.passkeyChallenge.count(), before);
      const expiresAt = new Date(Date.now() + 60000);
      const count = await prisma.passkeyChallenge.count();
      await prisma.passkeyChallenge.createMany({
        data: Array.from({ length: 1000 - count }, () => ({
          tokenHash: randomUUID(),
          challenge: randomUUID(),
          purpose: "authenticate",
          expiresAt,
        })),
      });
      const full = await post("passkeyAuthenticationOptions");
      assert.equal(full.status, 503);
      assert.equal(full.headers.getSetCookie().length, 0);
      await prisma.passkeyChallenge.deleteMany();
    },
  );
  await t.test("delete owner resources and reject passkey replay", async () => {
    const challenge = await post("passkeyAuthenticationOptions");
    const challengeCookie = challenge.headers
      .getSetCookie()
      .find((c) => c.startsWith("fitness_passkey_challenge="))
      ?.split(";")[0] as string;
    const response = {
      id: "not-a-passkey",
      rawId: "bm90LWEtcGFzc2tleQ",
      type: "public-key",
      clientExtensionResults: {},
      response: {
        clientDataJSON: "e30",
        authenticatorData: "e30",
        signature: "e30",
        userHandle: "",
      },
    };
    const attempt = await post(
      "authenticatePasskey",
      { response },
      challengeCookie,
    );
    assert.deepEqual(await attempt.json(), { result: false });
    assert.equal(await prisma.passkeyChallenge.count(), 0);
    const replay = await post(
      "authenticatePasskey",
      { response },
      challengeCookie,
    );
    assert.deepEqual(await replay.json(), { result: false });
    const denied = await post("passkeyRegistrationOptions", {
      password: "incorrect",
      name: "test",
    });
    assert.equal(denied.status, 403);
    const account = bootstrapSchema.parse(
      await (
        await app.request("/api/bootstrap", { headers: { cookie } })
      ).json(),
    ).user;
    assert.ok(account);
    const passkeyId = randomUUID();
    await prisma.passkey.create({
      data: {
        id: passkeyId,
        userId: account.id,
        name: "test",
        publicKey: Buffer.from([1]),
        counter: 0n,
      },
    });
    assert.equal(
      (await post("deletePasskey", { id: passkeyId }, otherCookie)).status,
      200,
    );
    assert.ok(await prisma.passkey.findUnique({ where: { id: passkeyId } }));
    assert.equal((await post("deletePasskey", { id: passkeyId })).status, 200);
    assert.equal(
      await prisma.passkey.findUnique({ where: { id: passkeyId } }),
      null,
    );
    const measurements = viewSchemas.measurements.parse(
      await (await view("measurements")).json(),
    );
    assert.equal(
      (
        await post("deleteMeasurementAction", {
          id: measurements.records[0].id,
        })
      ).status,
      200,
    );
    assert.equal(
      (await post("deleteWorkoutTemplateAction", { templateId })).status,
      200,
    );
  });
  await t.test(
    "password change revokes prior token and replaces cookie",
    async () => {
      const prior = cookie;
      const fields = {
        currentPassword: "password123",
        newPassword: "password456",
        confirmPassword: "password456",
      };
      const changes = await Promise.all([
        post("changePasswordAction", fields),
        post("changePasswordAction", fields),
      ]);
      assert.equal(
        changes.filter((response) => response.status === 200).length,
        1,
      );
      assert.equal(
        changes.filter((response) => response.status === 409).length,
        1,
      );
      const changed = changes.find(
        (response) => response.status === 200,
      ) as Response;
      cookie = sessionCookie(changed);
      assert.notEqual(cookie, prior);
      assert.equal((await view("workouts", prior)).status, 401);
      assert.equal((await view("workouts")).status, 200);
      const logout = await post("logoutAction");
      assert.equal(logout.status, 200);
      assert.equal((await view("workouts")).status, 401);
    },
  );
});
