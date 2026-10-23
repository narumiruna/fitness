import assert from "node:assert/strict";
import { test } from "node:test";
import bcrypt from "bcryptjs";
import { hashPassword, verifyPassword } from "../src/lib/password.js";

for (const [name, prefix] of [
  ["ASCII", "a".repeat(72)],
  ["UTF-8", "密".repeat(24)],
]) {
  test(`new bcrypt hashes verify the full ${name} password`, async () => {
    const password = `${prefix}original`;
    const hash = await hashPassword(password);
    assert.equal(await verifyPassword(password, hash), true);
    assert.equal(await verifyPassword(`${prefix}different`, hash), false);
    assert.equal(await verifyPassword(prefix, hash), false);
  });
}

test("new password hashes use a versioned salted bcrypt format", async () => {
  const first = await hashPassword("password123");
  const second = await hashPassword("password123");
  assert.match(first, /^bcrypt-sha256:v1:\$2[aby]\$12\$/);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword("password123", first), true);
  assert.equal(await verifyPassword("wrong-password", first), false);
});

test("existing bcrypt passwords remain usable without reinterpretation", async () => {
  for (const password of ["admin", `${"密".repeat(24)}legacy-suffix`]) {
    const hash = await bcrypt.hash(password, 4);
    assert.equal(await verifyPassword(password, hash), true);
    assert.equal(await verifyPassword("wrong-password", hash), false);
  }
});

test("unknown and malformed password formats do not authenticate", async () => {
  const hash = await hashPassword("password123");
  assert.equal(
    await verifyPassword("password123", hash.replace(":v1:", ":v2:")),
    false,
  );
  assert.equal(
    await verifyPassword("password123", "bcrypt-sha256:v1:bad"),
    false,
  );
});
