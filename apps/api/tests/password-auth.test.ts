import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

assert.ok(process.env.DATABASE_URL, "Use the disposable API test runner");
const origin =
  process.env.NODE_ENV === "production"
    ? "https://localhost:8784"
    : "http://localhost:8784";
const app = createApp({ trustedOrigin: origin });

after(async () => {
  await prisma.$disconnect();
});

function post(name: string, fields: Record<string, string>, cookie = "") {
  return app.request(`/api/actions/${name}`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", cookie },
    body: JSON.stringify(fields),
  });
}

function sessionCookie(response: Response) {
  const header = response.headers
    .getSetCookie()
    .find((value) => value.startsWith("fitness_session="));
  assert.ok(header, "Successful authentication issues a session cookie");
  return header.split(";")[0];
}

test("account creation and password changes verify all bytes and revoke old sessions", async (t) => {
  const key = randomUUID();
  const adminName = `password-admin-${key}`;
  const username = `password-user-${key}`;
  t.after(async () => {
    await prisma.user.deleteMany({
      where: { username: { in: [adminName, username] } },
    });
  });
  await prisma.user.create({
    data: {
      username: adminName,
      passwordHash: await bcrypt.hash("legacy-admin-password", 4),
      role: "ADMIN",
    },
  });
  const adminLogin = await post("loginAction", {
    username: adminName,
    password: "legacy-admin-password",
  });
  assert.equal((await adminLogin.json()).redirect, "/workouts");
  const adminCookie = sessionCookie(adminLogin);
  const prefix = "密".repeat(24);
  const original = `${prefix}original`;
  const replacement = `${prefix}replacement`;
  const created = await post(
    "createUserAction",
    { username, password: original, role: "USER" },
    adminCookie,
  );
  assert.equal(created.status, 200);

  const rejected = await post("loginAction", {
    username,
    password: replacement,
  });
  assert.equal((await rejected.json()).redirect, "/login?error=invalid");
  const login = await post("loginAction", { username, password: original });
  assert.equal((await login.json()).redirect, "/workouts");
  const oldCookie = sessionCookie(login);
  const changed = await post(
    "changePasswordAction",
    {
      currentPassword: original,
      newPassword: replacement,
      confirmPassword: replacement,
    },
    oldCookie,
  );
  assert.equal((await changed.json()).redirect, "/account/password?changed=1");
  const replacementCookie = sessionCookie(changed);
  const bootstrap = async (cookie: string) => {
    const response = await app.request("/api/bootstrap", {
      headers: { cookie },
    });
    return response.json();
  };
  assert.equal((await bootstrap(oldCookie)).user, null);
  assert.equal((await bootstrap(replacementCookie)).user.username, username);
  const oldLogin = await post("loginAction", { username, password: original });
  assert.equal((await oldLogin.json()).redirect, "/login?error=invalid");
  const newLogin = await post("loginAction", {
    username,
    password: replacement,
  });
  assert.equal((await newLogin.json()).redirect, "/workouts");
});
