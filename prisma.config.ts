import { defineConfig } from "prisma/config";
import { loadEnvironment } from "./apps/api/src/lib/environment";

loadEnvironment();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://fitness:fitness@localhost:5432/fitness",
  },
});
