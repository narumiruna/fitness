import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "fitness-ui-"));
const child = spawn(
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
      DATABASE_URL: `file:${join(directory, "test.db")}`,
      NODE_ENV: process.argv.includes("--production")
        ? "production"
        : "development",
    },
  },
);
const stop = () => child.kill("SIGTERM");
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
try {
  process.exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
} finally {
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
  rmSync(directory, { recursive: true, force: true });
}
