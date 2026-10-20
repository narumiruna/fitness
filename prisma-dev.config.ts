import { defineConfig } from "prisma/config";
import { developmentDatabaseUrl } from "./apps/api/src/lib/development-database";
import { loadEnvironment } from "./apps/api/src/lib/environment";

loadEnvironment(undefined, "development");

export default defineConfig({
  schema: "prisma/.dev/schema.prisma",
  datasource: { url: developmentDatabaseUrl() },
});
