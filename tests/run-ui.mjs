import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startPostgres } from "./postgres.mjs";

const controller = new AbortController();
let postgres;
let directory;
let child;
const production = process.argv.includes("--production");
const stop = (signal) => {
  process.exitCode = signal === "SIGINT" ? 130 : 143;
  controller.abort();
  child?.kill("SIGTERM");
};
const interrupt = () => stop("SIGINT");
const terminate = () => stop("SIGTERM");
process.on("SIGINT", interrupt);
process.on("SIGTERM", terminate);
try {
  let databaseUrl;
  if (production) {
    postgres = await startPostgres({ signal: controller.signal });
    databaseUrl = postgres.url;
  } else {
    directory = await mkdtemp(join(tmpdir(), "fitness-ui-"));
    databaseUrl = `file:${join(directory, "test.db")}`;
  }
  controller.signal.throwIfAborted();
  child = spawn(
    process.execPath,
    [
      "node_modules/@playwright/test/cli.js",
      "test",
      ...process.argv.slice(2).filter((arg) => arg !== "--production"),
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        NODE_ENV: production ? "production" : "development",
        PASSKEY_ORIGIN: `${production ? "https" : "http"}://localhost:8784`,
      },
    },
  );
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
  if (!controller.signal.aborted) process.exitCode = code;
} catch (error) {
  if (!controller.signal.aborted) throw error;
} finally {
  try {
    await postgres?.stop();
    if (directory) await rm(directory, { recursive: true, force: true });
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", terminate);
  }
}
