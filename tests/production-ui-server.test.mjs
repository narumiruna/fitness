import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { get } from "node:https";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

// Exercise the real TLS supervisor with a database-free Hono child in a
// disposable repository. Real API/database behavior belongs to production E2E.
async function launch(run, apiSource) {
  const directory = await mkdtemp(join(tmpdir(), "fitness-ui-server-test-"));
  const repository = join(directory, "repository");
  const temporary = join(directory, "temporary");
  await mkdir(join(repository, "tests"), { recursive: true });
  await mkdir(join(repository, "apps/api/src"), { recursive: true });
  await mkdir(temporary);
  await writeFile(join(repository, "package.json"), '{"type":"module"}');
  await symlink(
    join(process.cwd(), "node_modules"),
    join(repository, "node_modules"),
    "dir",
  );
  await copyFile(
    "tests/production-ui-server.mjs",
    join(repository, "tests/production-ui-server.mjs"),
  );
  const entry = join(repository, "apps/api/src/server.ts");
  if (apiSource) await writeFile(entry, apiSource);
  else await copyFile("tests/fixtures/production-ui-api.ts", entry);
  const child = spawn(process.execPath, ["tests/production-ui-server.mjs"], {
    cwd: repository,
    env: {
      ...process.env,
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://fitness:fitness@127.0.0.1:1/fitness",
      TMPDIR: temporary,
      TSX_DISABLE_CACHE: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  const exited = once(child, "exit");
  try {
    await run(child, exited, () => output);
    assert.deepEqual(
      await readdir(temporary),
      [],
      "TLS credentials must be removed",
    );
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await exited;
    }
    await rm(directory, { recursive: true, force: true });
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  test(`production TLS server cleans up after ${signal}`, {
    timeout: 30_000,
  }, async () => {
    await launch(async (child, exited, output) => {
      await new Promise((resolve, reject) => {
        const deadline = Date.now() + 15_000;
        const poll = () => {
          if (Date.now() > deadline || child.exitCode !== null) {
            reject(new Error(output()));
            return;
          }
          const req = get(
            "https://localhost:8784/favicon.ico",
            { rejectUnauthorized: false },
            (res) => {
              res.resume();
              res.on("end", () => {
                if (res.statusCode === 502) setTimeout(poll, 100);
                else if (
                  res.statusCode === 200 &&
                  res.headers["x-test-upstream"] === "hono-lifecycle-fixture"
                )
                  resolve();
                else
                  reject(
                    new Error(
                      `Unexpected upstream response: ${res.statusCode}`,
                    ),
                  );
              });
            },
          );
          req.on("error", () => setTimeout(poll, 100));
        };
        poll();
      });
      child.kill(signal);
      const [code, exitSignal] = await exited;
      assert.equal(code, signal === "SIGINT" ? 130 : 143, output());
      assert.equal(exitSignal, null, output());
      // Both the HTTPS listener and its Hono child must be gone.
      const match = output().match(
        /Test TLS proxy upstream: http:\/\/127\.0\.0\.1:(\d+)/,
      );
      assert.ok(match, output());
      for (const port of [8784, Number(match[1])]) {
        const probe = createServer();
        probe.listen(port, "127.0.0.1");
        await once(probe, "listening");
        await new Promise((resolve) => probe.close(resolve));
      }
    });
  });
}

test("production TLS supervisor preserves child initialization failures and removes credentials", {
  timeout: 30_000,
}, async () => {
  await launch(async (_child, exited, output) => {
    const [code, signal] = await exited;
    assert.equal(code, 23, output());
    assert.equal(signal, null, output());
    assert.match(output(), /fixture initialization failed/);
    const match = output().match(
      /Test TLS proxy upstream: http:\/\/127\.0\.0\.1:(\d+)/,
    );
    assert.ok(match, output());
    for (const port of [8784, Number(match[1])]) {
      const probe = createServer();
      probe.listen(port, "127.0.0.1");
      await once(probe, "listening");
      await new Promise((resolve) => probe.close(resolve));
    }
  }, 'process.stderr.write("fixture initialization failed\\n"); process.exit(23);');
});

test("production TLS startup refuses an occupied test port and removes credentials", {
  timeout: 30_000,
}, async () => {
  const occupied = createServer();
  occupied.listen(8784, "127.0.0.1");
  await once(occupied, "listening");
  try {
    await launch(async (_child, exited, output) => {
      const [code] = await exited;
      assert.notEqual(code, 0);
      assert.match(output(), /EADDRINUSE/);
      assert.equal(occupied.listening, true);
    });
  } finally {
    await new Promise((resolve) => occupied.close(resolve));
  }
});
