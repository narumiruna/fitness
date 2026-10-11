import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { setTimeout } from "node:timers/promises";
import { chromium } from "@playwright/test";
import { startPostgres } from "./postgres.mjs";

function docker(...args) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    timeout: 120_000,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test("Docker login diagnostics correlate requests without logging secrets", {
  timeout: 120_000,
}, async () => {
  const name = `fitness-logging-test-${randomUUID()}`;
  const postgres = await startPostgres();
  let browser;
  let networkCreated = false;
  let appCreated = false;
  try {
    docker("network", "create", name);
    networkCreated = true;
    docker("network", "connect", name, postgres.name);
    docker(
      "run",
      "--detach",
      "--name",
      name,
      "--network",
      name,
      "--publish",
      "127.0.0.1::8783",
      "--env",
      `DATABASE_URL=postgresql://fitness:fitness@${postgres.name}:5432/fitness`,
      "fitness-logging-test:local",
    );
    appCreated = true;
    const port = docker("port", name, "8783/tcp").split(":").at(-1);
    const baseURL = `http://localhost:${port}`;
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await fetch(`${baseURL}/setup`);
        if (response.ok) break;
      } catch {
        // Wait for migrations and server startup.
      }
      assert.ok(attempt < 59, "Docker app did not become ready");
      await setTimeout(500);
    }
    browser = await chromium.launch({ channel: "chrome" });
    const page = await browser.newPage();
    await page.goto(`${baseURL}/setup`);
    await page.getByLabel("Username").fill("logging-test-admin");
    await page
      .getByLabel("Password", { exact: true })
      .fill("private-test-password");
    await page.getByRole("button", { name: "Create admin" }).click();
    await page.waitForURL("**/workouts");
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL("**/login");
    await page.getByLabel("Username").fill("logging-test-admin");
    await page
      .getByLabel("Password", { exact: true })
      .fill("private-wrong-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("alert").waitFor();
    await page
      .getByLabel("Password", { exact: true })
      .fill("private-test-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL("**/workouts");
    const cookies = await page.context().cookies();
    const token = cookies.find(
      (cookie) => cookie.name === "fitness_session",
    )?.value;
    assert.ok(token, "Session cookie was not stored on localhost");
    await postgres.pool.query(
      'UPDATE "Session" SET "expiresAt" = now() - interval \'1 minute\'',
    );
    await page.goto(`${baseURL}/workouts`);
    await page.waitForURL("**/login");
    await page.context().clearCookies();
    await page.goto(`${baseURL}/workouts`);
    await page.waitForURL("**/login");
    await page.context().addCookies([
      {
        name: "fitness_session",
        value: "private-invalid-token",
        url: baseURL,
      },
    ]);
    await page.goto(`${baseURL}/workouts`);
    await page.waitForURL("**/login");

    const output = docker("logs", name);
    const records = output
      .split("\n")
      .filter((line) => line.startsWith("{"))
      .map((line) => JSON.parse(line));
    const succeeded = records.find(
      (record) => record.event === "auth.login_succeeded",
    );
    assert.ok(succeeded?.requestId);
    for (const event of [
      "request.received",
      "action.started",
      "session.created",
      "session.cookie_set",
      "session.secure_cookie_over_http",
      "action.control_flow",
    ]) {
      assert.ok(
        records.some(
          (record) =>
            record.event === event && record.requestId === succeeded.requestId,
        ),
        event,
      );
    }
    for (const event of [
      "auth.login_failed",
      "session.authenticated",
      "session.destroyed",
      "session.missing_cookie",
      "session.not_found",
      "session.expired",
      "auth.required",
    ]) {
      assert.ok(
        records.some((record) => record.event === event),
        event,
      );
    }
    assert.equal(
      records.some((record) => record.event === "action.failed"),
      false,
    );
    assert.equal(output.includes("private-"), false);
    assert.equal(output.includes(token), false);
    assert.equal(
      records.find((record) => record.event === "session.cookie_set").secure,
      true,
    );
  } finally {
    await browser?.close();
    if (appCreated) docker("rm", "--force", name);
    await postgres.stop();
    if (networkCreated) docker("network", "rm", name);
  }
});
