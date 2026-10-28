import assert from "node:assert/strict";
import test from "node:test";
import {
  actionEnvelopeSchema,
  bootstrapSchema,
  dateOnlySchema,
  ongoingSessionSchema,
  passkeysViewSchema,
  timestampSchema,
  userSchema,
  viewSchemas,
} from "../src/index.js";

test("calendar dates and timestamps have separate wire formats", () => {
  assert.equal(dateOnlySchema.parse("2026-10-20"), "2026-10-20");
  assert.equal(dateOnlySchema.safeParse("2026-02-30").success, false);
  assert.equal(
    dateOnlySchema.safeParse("2026-10-20T00:00:00.000Z").success,
    false,
  );
  assert.equal(timestampSchema.safeParse("2026-10-20").success, false);
  assert.equal(
    timestampSchema.parse("2026-10-20T00:00:00.000Z"),
    "2026-10-20T00:00:00.000Z",
  );
});
test("safe user and passkey DTOs exclude credential fields", () => {
  assert.deepEqual(
    userSchema.parse({
      id: "u1",
      username: "user",
      role: "USER",
      passwordHash: "secret",
      sessions: ["token"],
    }),
    { id: "u1", username: "user", role: "USER" },
  );
  const result = passkeysViewSchema.parse({
    passkeys: [
      {
        id: "credential",
        name: "key",
        createdAt: "2026-10-20T00:00:00.000Z",
        lastUsedAt: null,
        publicKey: new Uint8Array([1]),
        counter: 1n,
        userId: "user",
      },
    ],
  });
  assert.deepEqual(Object.keys(result.passkeys[0]).sort(), [
    "createdAt",
    "id",
    "lastUsedAt",
    "name",
  ]);
  assert.doesNotThrow(() => JSON.stringify(result));
});
test("DTO guards enforce null and numeric types", () => {
  assert.equal(
    bootstrapSchema.safeParse({ user: null, hasUsers: false, locale: "en" })
      .success,
    true,
  );
  assert.equal(
    viewSchemas.measurements.safeParse({
      records: [
        {
          id: "m",
          date: "2026-10-20",
          weight: "80",
          waist: null,
          updatedAt: "2026-10-20T00:00:00.000Z",
        },
      ],
      goal: null,
      today: "2026-10-20",
    }).success,
    false,
  );
  assert.equal(
    viewSchemas.measurements.safeParse({
      records: [
        {
          id: "m",
          date: "2026-10-20",
          weight: 80,
          waist: null,
          updatedAt: "2026-10-20T00:00:00.000Z",
        },
      ],
      goal: { weight: null },
      today: "2026-10-20",
    }).success,
    true,
  );
  for (const result of [1n, new Uint8Array([1]), Infinity, NaN])
    assert.equal(actionEnvelopeSchema.safeParse({ result }).success, false);
});
test("workouts require ongoing summaries with calendar dates and set counts", () => {
  const schema = viewSchemas.workouts.pick({ ongoingSessions: true });
  const session = {
    id: "ongoing-session",
    date: "2026-10-20",
    title: null,
    state: "ACTIVE",
    totalSets: 0,
    completedSets: 0,
  };
  assert.equal(schema.safeParse({}).success, false);
  assert.deepEqual(schema.parse({ ongoingSessions: [] }), {
    ongoingSessions: [],
  });
  for (const state of ["ACTIVE", "PAUSED"]) {
    assert.deepEqual(
      schema.parse({ ongoingSessions: [{ ...session, state }] }),
      { ongoingSessions: [{ ...session, state }] },
    );
  }
  for (const invalid of [
    { state: "COMPLETED" },
    { state: "ABANDONED" },
    { date: "2026-10-20T00:00:00.000Z" },
    { date: "2026-02-30" },
    { totalSets: -1 },
    { totalSets: 0.5 },
    { completedSets: -1 },
    { completedSets: "0" },
    { completedSets: undefined },
    { title: undefined },
  ]) {
    assert.equal(
      ongoingSessionSchema.safeParse({ ...session, ...invalid }).success,
      false,
    );
  }
  assert.deepEqual(
    ongoingSessionSchema.parse({
      ...session,
      userId: "private",
      sets: [],
      updatedAt: "private",
    }),
    session,
  );
});
test("redirect envelopes only contain site-relative navigation", () => {
  assert.equal(
    actionEnvelopeSchema.safeParse({ redirect: "https://attacker.invalid" })
      .success,
    false,
  );
  assert.deepEqual(
    actionEnvelopeSchema.parse({
      redirect: "/workouts",
      passwordHash: "secret",
    }),
    { redirect: "/workouts" },
  );
});
