import { basename, dirname, isAbsolute } from "node:path";
import { defineConfig } from "@playwright/test";

// Never reuse a running application or a developer's database.
const databaseUrl = process.env.DATABASE_URL ?? "";
const sqlitePath = databaseUrl.startsWith("file:") ? databaseUrl.slice(5) : "";
const isTemporarySQLite =
  isAbsolute(sqlitePath) &&
  basename(dirname(sqlitePath)).startsWith("fitness-ui-") &&
  basename(sqlitePath) === "test.db";
const isTemporaryPostgres =
  /^postgresql:\/\/fitness:fitness@127\.0\.0\.1:\d+\/fitness$/.test(
    databaseUrl,
  );
if (
  process.env.NODE_ENV === "production"
    ? !isTemporaryPostgres
    : !isTemporarySQLite
) {
  throw new Error("Run UI tests through npm run test:ui.");
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: "list",
  use: {
    baseURL: "http://localhost:8784",
    channel: "chrome",
    actionTimeout: 15_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command:
      process.env.NODE_ENV === "production"
        ? "npm exec prisma migrate deploy && npm exec next start -- -H 127.0.0.1 -p 8784"
        : "npm run dev",
    url: "http://localhost:8784",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
