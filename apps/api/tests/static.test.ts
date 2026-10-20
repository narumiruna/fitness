import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { prisma } from "../src/lib/prisma.js";
import { createServerApp } from "../src/server.js";

test("static assets, browser routes, HEAD, API isolation and traversal", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "fitness-api-static-"));
  try {
    mkdirSync(path.join(directory, "assets"));
    writeFileSync(
      path.join(directory, "index.html"),
      "<!doctype html><title>Fitness shell</title>",
    );
    writeFileSync(
      path.join(directory, "assets/app-test.css"),
      "body{color:black}",
    );
    const app = createServerApp(directory);
    for (const pathname of [
      "/",
      "/workouts",
      "/workouts/new",
      "/workouts/test-id",
      "/calendar",
      "/stats",
      "/exercises/test-id",
      "/measurements",
      "/account/passkeys",
      "/account/password",
      "/admin/users",
      "/data",
      "/source",
    ]) {
      const response = await app.request(pathname, {
        headers: { accept: "text/html" },
      });
      assert.equal(response.status, 200, pathname);
      assert.match(response.headers.get("content-type") ?? "", /text\/html/);
      assert.match(response.headers.get("cache-control") ?? "", /no-store/);
      assert.match(await response.text(), /Fitness shell/);
    }
    const asset = await app.request("/assets/app-test.css");
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get("content-type") ?? "", /text\/css/);
    assert.match(asset.headers.get("cache-control") ?? "", /immutable/);
    const head = await app.request("/assets/app-test.css", { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), "");
    assert.ok(Number(head.headers.get("content-length")) > 0);
    for (const pathname of [
      "/assets/missing.css",
      "/assets/%2e%2e%2fsecret",
      "/%5c..%5csecret",
      "/not-a-browser-page",
      "/workouts/unexpected/nested",
    ]) {
      assert.equal(
        (await app.request(pathname, { headers: { accept: "text/html" } }))
          .status,
        404,
        pathname,
      );
    }
    const api = await app.request("/api/not-a-route", {
      headers: { accept: "text/html" },
    });
    assert.equal(api.status, 404);
    assert.match(api.headers.get("content-type") ?? "", /application\/json/);
    assert.doesNotMatch(await api.text(), /Fitness shell/);
    assert.equal(
      (
        await app.request("/workouts", {
          headers: { accept: "application/json" },
        })
      ).status,
      404,
    );
    assert.equal((await app.request("/data/export")).status, 401);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    await prisma.$disconnect();
  }
});
