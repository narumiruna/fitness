import { spawn } from "node:child_process";
import { startPostgres } from "./postgres.mjs";

const controller = new AbortController();
let postgres;
let child;
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
  postgres = await startPostgres({ signal: controller.signal });
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
        DATABASE_URL: postgres.url,
        NODE_ENV: process.argv.includes("--production")
          ? "production"
          : "development",
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
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", terminate);
  }
}
