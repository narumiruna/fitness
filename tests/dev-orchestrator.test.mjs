import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

const workspaces = ["core", "contracts", "api", "web"];

// These fixtures run only this copy of the orchestrator. No installed npm,
// workspace script, database, or HTTP server is used.
const fakeNpm = `#!${process.execPath}
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const build = process.argv[3] === "build:packages";
const name = build ? "build" : process.argv.at(-1).replace("@narumitw/fitness-", "");
const directory = process.env.FIXTURE_DIRECTORY;
const record = (event) => appendFileSync(join(directory, "events"), JSON.stringify({ name, event, pid: process.pid, cwd: process.cwd(), nodeEnv: process.env.NODE_ENV }) + "\\n");
record("started");
if (build && process.env.FIXTURE_BUILD === "fail") process.exit(19);
if (build && process.env.FIXTURE_BUILD !== "wait") process.exit(0);
const worker = spawn(process.execPath, [fileURLToPath(new URL("./worker.mjs", import.meta.url)), name], { stdio: "inherit" });
let stopping = false;
const stop = (signal) => {
  record(signal);
  if (process.env.FIXTURE_IGNORE_TERM === name) return;
  if (stopping) return;
  stopping = true;
  if (process.env.FIXTURE_LEADER_EXIT === name) process.exit(0);
  worker.once("exit", () => process.exit(0));
  worker.kill("SIGTERM");
};
process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));
const timer = setInterval(() => {
  if (!existsSync(join(directory, name + ".worker-ready"))) return;
  writeFileSync(join(directory, name + ".ready"), "ready");
  if (process.env.FIXTURE_FAIL_WORKSPACE !== name) return;
  if (!["core", "contracts", "api", "web"].every((value) => existsSync(join(directory, value + ".ready")))) return;
  clearInterval(timer);
  record("failed");
  if (process.env.FIXTURE_LEADER_EXIT === name) process.exit(23);
  worker.once("exit", () => process.exit(23));
  worker.kill("SIGTERM");
}, 20);
`;

const fakeWorker = `import { appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const name = process.argv[2] + ".worker";
const directory = process.env.FIXTURE_DIRECTORY;
const record = (event) => appendFileSync(join(directory, "events"), JSON.stringify({ name, event, pid: process.pid }) + "\\n");
process.on("SIGTERM", () => { record("SIGTERM"); if (process.env.FIXTURE_WORKER_IGNORE_TERM === process.argv[2]) return; process.exit(0); });
record("started");
writeFileSync(join(directory, process.argv[2] + ".worker-ready"), "ready");
setInterval(() => {}, 1000);
`;

async function until(predicate, message, timeout = 7000) {
  const deadline = Date.now() + timeout;
  while (!(await predicate())) {
    assert.ok(Date.now() < deadline, message);
    await delay(20);
  }
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    throw error;
  }
}

async function reserve(port) {
  const server = createServer();
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  return server;
}

async function release(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function assertPortsReleased() {
  for (const port of [8784, 8785]) {
    const server = await reserve(port);
    await release(server);
  }
}

async function fixture(environment = {}) {
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), "fitness-dev-orchestrator-")),
  );
  await mkdir(join(directory, "scripts"));
  await mkdir(join(directory, "bin"));
  await copyFile(
    new URL("../scripts/dev.mjs", import.meta.url),
    join(directory, "scripts/dev.mjs"),
  );
  await writeFile(join(directory, "package.json"), '{"type":"module"}');
  await writeFile(join(directory, "bin/npm"), fakeNpm, { mode: 0o755 });
  await writeFile(join(directory, "bin/worker.mjs"), fakeWorker);
  await writeFile(join(directory, "events"), "");
  let output = "";
  let result;
  const child = spawn(process.execPath, [join(directory, "scripts/dev.mjs")], {
    // A different cwd proves that dev.mjs resolves its own workspace root.
    cwd: tmpdir(),
    env: {
      ...process.env,
      ...environment,
      PATH: `${join(directory, "bin")}${delimiter}${process.env.PATH ?? ""}`,
      FIXTURE_DIRECTORY: directory,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (data) => {
    output += data;
  });
  child.stderr.on("data", (data) => {
    output += data;
  });
  child.once("error", (error) => {
    output += error.message;
  });
  const closed = new Promise((resolve) => {
    child.once("close", (code, signal) => {
      result = { code, signal };
      resolve();
    });
  });
  const events = async () => {
    const contents = await readFile(join(directory, "events"), "utf8");
    return contents.trim() ? contents.trim().split("\n").map(JSON.parse) : [];
  };
  return {
    child,
    directory,
    events,
    async ready(names = workspaces) {
      await until(async () => {
        const records = await events();
        return names.every((name) =>
          records.some(
            (event) =>
              event.name === `${name}.worker` && event.event === "started",
          ),
        );
      }, `Fake workspace children did not start. ${output}`);
    },
    async exited(expectedCode) {
      await until(() => result, `Orchestrator did not exit. ${output}`, 10_000);
      assert.deepEqual(result, { code: expectedCode, signal: null }, output);
    },
    async assertClean() {
      const started = (await events()).filter(
        (event) => event.event === "started",
      );
      for (const event of started) {
        await until(
          () => !alive(event.pid),
          `Orchestrator left ${event.name} (${event.pid}) running. ${output}`,
        );
      }
      await assertPortsReleased();
    },
    get output() {
      return output;
    },
    async dispose() {
      if (!result) {
        child.kill("SIGTERM");
        await Promise.race([closed, delay(4500)]);
      }
      // Failure cleanup targets only PIDs recorded by this disposable fixture.
      for (const event of await events()) {
        if (event.event !== "started" || event.name.endsWith(".worker"))
          continue;
        try {
          process.kill(-event.pid, "SIGKILL");
        } catch (error) {
          if (error.code !== "ESRCH") throw error;
        }
      }
      if (!result) child.kill("SIGKILL");
      await closed;
      await rm(directory, { recursive: true, force: true });
    },
  };
}

test("development orchestrator lifecycle in disposable fake workspaces", {
  skip: process.platform === "win32",
  timeout: 90_000,
}, async (t) => {
  for (const port of [8784, 8785]) {
    await t.test(
      `refuses occupied port ${port} before starting npm`,
      async () => {
        const occupied = await reserve(port);
        let run;
        try {
          run = await fixture();
          await run.exited(1);
          assert.match(run.output, /EADDRINUSE/);
          assert.match(run.output, new RegExp(`port: ${port}`));
          assert.deepEqual(await run.events(), []);
          assert.equal(occupied.listening, true);
        } finally {
          await run?.dispose();
          await release(occupied);
        }
        await assertPortsReleased();
      },
    );
  }

  await t.test(
    "build failure releases reservations without starting watchers",
    async () => {
      const run = await fixture({ FIXTURE_BUILD: "fail" });
      try {
        await run.exited(1);
        assert.match(run.output, /Shared package build failed/);
        assert.deepEqual(
          (await run.events()).map((event) => event.name),
          ["build"],
        );
        await run.assertClean();
      } finally {
        await run.dispose();
      }
    },
  );

  for (const [signal, code] of [
    ["SIGINT", 130],
    ["SIGTERM", 143],
  ]) {
    await t.test(
      `${signal} stops all watchers and their descendants`,
      async () => {
        const run = await fixture();
        try {
          await run.ready();
          const records = await run.events();
          const started = records.filter((event) => event.event === "started");
          for (const name of ["build", ...workspaces]) {
            const event = started.find((event) => event.name === name);
            assert.equal(event?.cwd, run.directory);
            assert.equal(event?.nodeEnv, "development");
          }
          run.child.kill(signal);
          await run.exited(code);
          await run.assertClean();
          const stopped = await run.events();
          for (const name of workspaces) {
            for (const processName of [name, `${name}.worker`]) {
              assert.ok(
                stopped.some(
                  (event) =>
                    event.name === processName && event.event === "SIGTERM",
                ),
                `${processName} did not receive SIGTERM`,
              );
            }
          }
        } finally {
          await run.dispose();
        }
      },
    );
  }

  await t.test(
    "signal during the initial build stops its descendants and releases ports",
    async () => {
      const run = await fixture({ FIXTURE_BUILD: "wait" });
      try {
        await run.ready(["build"]);
        run.child.kill("SIGTERM");
        await run.exited(143);
        assert.equal(
          (await run.events()).some((event) => workspaces.includes(event.name)),
          false,
        );
        await run.assertClean();
      } finally {
        await run.dispose();
      }
    },
  );

  await t.test(
    "a failed watcher stops its siblings and preserves the exit code",
    async () => {
      const run = await fixture({ FIXTURE_FAIL_WORKSPACE: "core" });
      try {
        await run.exited(23);
        const records = await run.events();
        assert.ok(
          records.some(
            (event) => event.name === "core" && event.event === "failed",
          ),
        );
        for (const name of ["contracts", "api", "web"]) {
          assert.ok(
            records.some(
              (event) => event.name === name && event.event === "SIGTERM",
            ),
          );
        }
        await run.assertClean();
      } finally {
        await run.dispose();
      }
    },
  );

  await t.test(
    "cleans up a worker after its failed group leader exits",
    async () => {
      const run = await fixture({
        FIXTURE_FAIL_WORKSPACE: "core",
        FIXTURE_LEADER_EXIT: "core",
        FIXTURE_WORKER_IGNORE_TERM: "core",
      });
      try {
        await run.exited(23);
        await run.assertClean();
      } finally {
        await run.dispose();
      }
    },
  );

  await t.test(
    "escalates after a leader exits but its worker ignores SIGTERM",
    async () => {
      const run = await fixture({
        FIXTURE_LEADER_EXIT: "web",
        FIXTURE_WORKER_IGNORE_TERM: "web",
      });
      try {
        await run.ready();
        run.child.kill("SIGTERM");
        await run.exited(143);
        await run.assertClean();
      } finally {
        await run.dispose();
      }
    },
  );

  await t.test("duplicate shutdown signals do not orphan workers", async () => {
    const run = await fixture({
      FIXTURE_LEADER_EXIT: "web",
      FIXTURE_WORKER_IGNORE_TERM: "web",
    });
    try {
      await run.ready();
      run.child.kill("SIGTERM");
      await delay(50);
      run.child.kill("SIGTERM");
      await run.exited(143);
      await run.assertClean();
    } finally {
      await run.dispose();
    }
  });

  await t.test("forces a watcher to stop when it ignores SIGTERM", async () => {
    const run = await fixture({ FIXTURE_IGNORE_TERM: "web" });
    try {
      await run.ready();
      run.child.kill("SIGTERM");
      await run.exited(143);
      assert.ok(
        (await run.events()).some(
          (event) => event.name === "web" && event.event === "SIGTERM",
        ),
      );
      await run.assertClean();
    } finally {
      await run.dispose();
    }
  });
});
