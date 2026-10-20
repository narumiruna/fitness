import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:net";
import test from "node:test";
import { setTimeout } from "node:timers/promises";
import { chromium } from "@playwright/test";
import { createTestTlsProxy } from "./fixtures/tls-proxy.mjs";
import { startPostgres } from "./postgres.mjs";

function docker(...args) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    timeout: 120_000,
  });
  assert.equal(result.status, 0, result.stderr);
  return (
    args[0] === "logs" ? `${result.stdout}\n${result.stderr}` : result.stdout
  ).trim();
}

test("Docker login diagnostics correlate requests without logging secrets", {
  timeout: 120_000,
}, async () => {
  const name = `fitness-logging-test-${randomUUID()}`;
  const postgres = await startPostgres();
  let browser;
  let tls;
  let networkCreated = false;
  let appCreated = false;
  try {
    docker("network", "create", name);
    networkCreated = true;
    docker("network", "connect", name, postgres.name);
    const reservation = createServer();
    reservation.listen(0, "127.0.0.1");
    await once(reservation, "listening");
    const port = reservation.address().port;
    await new Promise((resolve) => reservation.close(resolve));
    const upstreamURL = `http://127.0.0.1:${port}`;
    tls = await createTestTlsProxy(port);
    const baseURL = tls.url;
    docker(
      "run",
      "--detach",
      "--name",
      name,
      "--network",
      name,
      "--publish",
      `127.0.0.1:${port}:8783`,
      "--env",
      `DATABASE_URL=postgresql://fitness:fitness@${postgres.name}:5432/fitness`,
      "--env",
      `PASSKEY_ORIGIN=${baseURL}`,
      "fitness-logging-test:local",
    );
    appCreated = true;
    assert.equal(docker("port", name, "8783/tcp"), `127.0.0.1:${port}`);
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await fetch(`${upstreamURL}/setup`, {
          headers: { accept: "text/html" },
        });
        if (response.ok) break;
      } catch {
        // Wait for migrations and server startup.
      }
      if (attempt >= 59) {
        const startup = docker("logs", name).replace(
          /(postgres(?:ql)?:\/\/)[^@\s]+@/g,
          "$1[REDACTED]@",
        );
        assert.fail(`Docker app did not become ready:\n${startup}`);
      }
      await setTimeout(500);
    }
    assert.notEqual(docker("exec", name, "id", "-u"), "0");
    const shell = await fetch(`${upstreamURL}/workouts/nested-id`, {
      headers: { accept: "text/html" },
    });
    assert.equal(shell.status, 200);
    const html = await shell.text();
    const asset = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
    assert.ok(asset, "Built browser entry is present");
    assert.equal((await fetch(`${upstreamURL}${asset}`)).status, 200);
    assert.equal((await fetch(`${upstreamURL}/assets/missing.js`)).status, 404);
    const missingApi = await fetch(`${upstreamURL}/api/not-found`);
    assert.equal(missingApi.status, 404);
    assert.match(missingApi.headers.get("content-type"), /application\/json/);
    browser = await chromium.launch({ channel: "chrome" });
    const page = await browser.newPage({ ignoreHTTPSErrors: true });
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
      "request.completed",
      "action.started",
      "session.created",
      "session.cookie_set",
      "session.secure_cookie_over_http",
      "action.redirect",
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
    docker("restart", name);
    for (let attempt = 0; ; attempt++) {
      try {
        if (
          (
            await fetch(`${upstreamURL}/source`, {
              headers: { accept: "text/html" },
            })
          ).ok
        )
          break;
      } catch {
        /* Restart can briefly close the socket. */
      }
      assert.ok(attempt < 59, "Isolated app did not restart");
      await setTimeout(500);
    }
    assert.equal(
      (await postgres.pool.query('SELECT count(*) AS count FROM "User"'))
        .rows[0].count,
      "1",
    );
  } finally {
    await browser?.close();
    await tls?.stop();
    if (appCreated) docker("rm", "--force", name);
    await postgres.stop();
    if (networkCreated) docker("network", "rm", name);
  }
});

test("failed container migrations stop before the API starts", {
  timeout: 120_000,
}, () => {
  const name = `fitness-migration-failure-test-${randomUUID()}`;
  let created = false;
  try {
    docker(
      "run",
      "--detach",
      "--name",
      name,
      "--network",
      "none",
      "--env",
      "DATABASE_URL=postgresql://fitness:fitness@127.0.0.1:1/fitness?connect_timeout=1",
      "--env",
      "PASSKEY_ORIGIN=https://localhost:8784",
      "fitness-logging-test:local",
    );
    created = true;
    assert.notEqual(docker("wait", name), "0");
    assert.equal(
      docker("inspect", "--format", "{{.State.Running}}", name),
      "false",
    );
    const output = docker("logs", name);
    assert.match(output, /P1001|Can't reach database server/);
    assert.doesNotMatch(output, /database\.client_created|server\.listening/);
  } finally {
    if (created) docker("rm", "--force", name);
  }
});
