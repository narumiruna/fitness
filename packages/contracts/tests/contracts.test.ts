import assert from "node:assert/strict";
import test from "node:test";
import {
  actionEnvelopeSchema,
  bootstrapSchema,
  dateOnlySchema,
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
