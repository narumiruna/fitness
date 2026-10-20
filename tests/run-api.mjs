import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startPostgres } from "./postgres.mjs";

const controller = new AbortController();
let postgres;
let directory;
let child;
const production = process.argv.includes("--postgres");
const stop = (signal) => {
  process.exitCode = signal === "SIGINT" ? 130 : 143;
  controller.abort();
  child?.kill("SIGTERM");
};
const interrupt = () => stop("SIGINT");
const terminate = () => stop("SIGTERM");
process.on("SIGINT", interrupt);
process.on("SIGTERM", terminate);

async function run(args, env) {
  controller.signal.throwIfAborted();
  child = spawn(process.execPath, args, { stdio: "inherit", env });
  const [code] = await once(child, "exit");
  child = undefined;
  controller.signal.throwIfAborted();
  if (code !== 0) throw new Error(`API test subprocess failed (${code}).`);
}

try {
  let databaseUrl;
  if (production) {
    postgres = await startPostgres({ signal: controller.signal });
    databaseUrl = postgres.url;
  } else {
    directory = await mkdtemp(join(tmpdir(), "fitness-api-"));
    databaseUrl = `file:${join(directory, "test.db")}`;
  }
  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    NODE_ENV: production ? "production" : "development",
    PASSKEY_ORIGIN: "https://localhost:8784",
  };
  await run(
    [
      "node_modules/prisma/build/index.js",
      ...(production
        ? ["migrate", "deploy"]
        : ["db", "push", "--config", "prisma-dev.config.ts"]),
    ],
    env,
  );
  const files = (await readdir("apps/api/tests"))
    .filter((file) => file.endsWith(".test.ts"))
    .sort()
    .map((file) => join("apps/api/tests", file));
  if (files.length === 0) throw new Error("API test files are missing.");
  await run(
    ["--import", "tsx", "--test", "--test-concurrency=1", ...files],
    env,
  );
} catch (error) {
  if (!controller.signal.aborted) {
    console.error(error);
    process.exitCode = 1;
  }
} finally {
  try {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await once(child, "exit");
    }
    await postgres?.stop();
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true });
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", terminate);
  }
}
