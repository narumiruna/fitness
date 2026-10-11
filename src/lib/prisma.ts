import nextEnv from "@next/env";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaClient as SQLiteClient } from "@/generated/prisma-sqlite/client";
import { developmentDatabaseUrl } from "@/lib/development-database";
import { getLogger } from "@/lib/logger";

const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createPrismaClient>;
};

const isProduction = process.env.NODE_ENV === "production";
if (!isProduction) nextEnv.loadEnvConfig(process.cwd(), true);
const provider = isProduction ? "postgresql" : "sqlite";

function createPrismaClient() {
  getLogger().info(
    { event: "database.client_created", provider },
    "Database client created",
  );
  // Both clients are generated from the same models. Use the canonical client
  // type so application queries have one shared API.
  const client = isProduction
    ? new PrismaClient({
        adapter: new PrismaPg({
          connectionString:
            process.env.DATABASE_URL ??
            "postgresql://fitness:fitness@localhost:5432/fitness",
        }),
      })
    : new SQLiteClient({
        adapter: new PrismaBetterSqlite3({ url: developmentDatabaseUrl() }),
      });
  return (client as unknown as PrismaClient).$extends({
    query: {
      async $allOperations({ model, operation, args, query }) {
        const log = getLogger();
        const start = performance.now();
        try {
          const result = await query(args);
          log.info(
            {
              event: "database.operation_completed",
              model: model ?? "raw",
              operation,
              durationMs: Math.round(performance.now() - start),
            },
            "Database operation completed",
          );
          return result;
        } catch (err) {
          log.error(
            {
              event: "database.operation_failed",
              model: model ?? "raw",
              operation,
              durationMs: Math.round(performance.now() - start),
              err,
            },
            "Database operation failed",
          );
          throw err;
        }
      },
    },
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
