import { resolve } from "node:path";
import { defineConfig } from "@playwright/test";
import base from "../playwright.config";

const server = base.webServer;
if (!server || Array.isArray(server))
  throw new Error(
    "The participant session requires the root UI server config.",
  );

// Preserve the disposable-database guard, fixed port, and no-server-reuse policy.
export default defineConfig({
  ...base,
  testDir: "../apps/web/e2e",
  testMatch: "participant-session.ts",
  webServer: { ...server, cwd: resolve(import.meta.dirname, "..") },
  use: { ...base.use, headless: false, screenshot: "off", trace: "off" },
});
