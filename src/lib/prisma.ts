import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getLogger } from "@/lib/logger";

const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createPrismaClient>;
};

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://fitness:fitness@localhost:5432/fitness";
const adapter = new PrismaPg({ connectionString: databaseUrl });

function createPrismaClient() {
  getLogger().info(
    { event: "database.client_created", provider: "postgresql" },
    "Database client created",
  );
  return new PrismaClient({ adapter }).$extends({
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
