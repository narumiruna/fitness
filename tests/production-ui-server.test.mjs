import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { get } from "node:https";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

// Requires npm run build. No database queries or production services are used.
async function launch(run) {
  const directory = await mkdtemp(join(tmpdir(), "fitness-ui-server-test-"));
  const child = spawn(process.execPath, ["tests/production-ui-server.mjs"], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://fitness:fitness@127.0.0.1:1/fitness",
      TMPDIR: directory,
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
      await readdir(directory),
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
                else resolve();
              });
            },
          );
          req.on("error", () => setTimeout(poll, 100));
        };
        poll();
      });
      child.kill(signal);
      await exited;
      // Both the HTTPS listener and its Next.js child must be gone.
      const match = output().match(/Local:\s+http:\/\/127\.0\.0\.1:(\d+)/);
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
