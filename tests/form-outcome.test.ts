import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { SessionError, sessionOutcome } from "../apps/api/src/lib/form-outcome";

test("expected session failures are serializable codes, not raw errors", async () => {
  for (const code of [
    "invalidSessionInput",
    "sessionConflict",
    "sessionIncomplete",
    "sessionUnavailable",
  ] as const) {
    const outcome = await sessionOutcome(async () => {
      throw new SessionError(code);
    });
    assert.deepEqual(JSON.parse(JSON.stringify(outcome)), { error: code });
  }
  const outcome = await sessionOutcome(async () => {
    z.number().parse("private input");
  });
  assert.deepEqual(outcome, { error: "invalidSessionInput" });
});

test("success preserves void callers and unexpected errors remain exceptions", async () => {
  assert.equal(await sessionOutcome(async () => {}), undefined);
  const error = new Error("private database details");
  await assert.rejects(
    sessionOutcome(async () => {
      throw error;
    }),
    (caught) => caught === error,
  );
});
