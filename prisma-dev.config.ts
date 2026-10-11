import nextEnv from "@next/env";
import { defineConfig } from "prisma/config";
import { developmentDatabaseUrl } from "./src/lib/development-database";

nextEnv.loadEnvConfig(process.cwd(), true);

export default defineConfig({
  schema: "prisma/.dev/schema.prisma",
  datasource: { url: developmentDatabaseUrl() },
});
