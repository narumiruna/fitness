import { spawn } from "node:child_process";
import { startPostgres } from "./postgres.mjs";

const postgres = await startPostgres();
let child;
const stop = () => child?.kill("SIGTERM");
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
try {
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
  process.exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
} finally {
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
  await postgres.stop();
}
