import { defineConfig } from "@playwright/test";

// Never reuse a running application or a developer's database.
if (!/\/fitness-ui-[^/]+\/test\.db$/.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Run UI tests through npm run test:ui.");
}

export default defineConfig({
  testDir: "./tests",
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
    command: `npm exec prisma migrate deploy && ${process.env.NODE_ENV === "production" ? "npm run start" : "npm run dev"}`,
    url: "http://localhost:8783",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
