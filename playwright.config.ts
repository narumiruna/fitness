import { defineConfig } from "@playwright/test";

// Never reuse a running application or a developer's database.
if (
  !/^postgresql:\/\/fitness:fitness@127\.0\.0\.1:\d+\/fitness$/.test(
    process.env.DATABASE_URL ?? "",
  )
) {
  throw new Error("Run UI tests through npm run test:ui.");
}

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: "list",
  use: {
    baseURL: "http://localhost:8783",
    channel: "chrome",
    actionTimeout: 15_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command:
      process.env.NODE_ENV === "production"
        ? "npm exec prisma migrate deploy && npm run start"
        : "npm run dev",
    url: "http://localhost:8783",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
