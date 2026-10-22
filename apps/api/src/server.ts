import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { getMimeType } from "hono/utils/mime";
import { createApp } from "./app.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";
import { validateProductionOrigin } from "./origin.js";
import { repositoryRoot } from "./paths.js";

const browserPath =
  /^\/(?:$|login$|setup$|workouts(?:\/new|\/[^/.]+)?$|calendar$|stats$|exercises(?:\/[^/.]+)?$|measurements$|data$|source$|admin\/users$|oauth\/consent$|account\/(?:password|passkeys|connections)$)/;
export function createServerApp(
  staticRoot = path.join(repositoryRoot, "apps/web/dist"),
) {
  const app = createApp();
  app.notFound(async (c) => {
    if (
      !["GET", "HEAD"].includes(c.req.method) ||
      c.req.path === "/api" ||
      c.req.path.startsWith("/api/")
    )
      return c.json(
        {
          error: {
            code: "NOT_FOUND",
            requestId: c.res.headers.get("x-request-id") ?? "",
          },
        },
        404,
      );
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(c.req.url).pathname);
    } catch {
      return c.text("Not found", 404);
    }
    if (
      pathname.includes("\\") ||
      pathname.includes("\0") ||
      pathname.split("/").includes("..")
    )
      return c.text("Not found", 404);
    let filename = path.resolve(staticRoot, `.${pathname}`);
    if (
      !filename.startsWith(`${path.resolve(staticRoot)}${path.sep}`) &&
      filename !== path.resolve(staticRoot)
    )
      return c.text("Not found", 404);
    let info = await stat(filename).catch(() => null);
    let shell = false;
    if (!info?.isFile()) {
      if (
        !browserPath.test(pathname) ||
        !c.req.header("accept")?.includes("text/html")
      )
        return c.text("Not found", 404);
      filename = path.join(staticRoot, "index.html");
      info = await stat(filename).catch(() => null);
      shell = true;
    }
    if (!info?.isFile()) return c.text("Not found", 404);
    c.header(
      "content-type",
      getMimeType(filename) ?? "application/octet-stream",
    );
    c.header("content-length", String(info.size));
    c.header(
      "cache-control",
      !shell && pathname.startsWith("/assets/")
        ? "public, max-age=31536000, immutable"
        : "private, no-store",
    );
    if (c.req.method === "HEAD") return c.body(null);
    return c.body(Readable.toWeb(createReadStream(filename)) as ReadableStream);
  });
  return app;
}
export async function startServer() {
  if (process.env.NODE_ENV === "production") validateProductionOrigin();
  await prisma.$connect();
  await prisma.$queryRaw`SELECT 1`;
  const port = Number(
    process.env.PORT ?? (process.env.NODE_ENV === "production" ? 8783 : 8785),
  );
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid port");
  const host =
    process.env.HOST ??
    (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
  const app = createServerApp();
  const server = serve({ fetch: app.fetch, port, hostname: host }, () =>
    logger.info({ event: "server.listening", port, host }, "API listening"),
  );
  server.on("error", (err) => {
    logger.error({ event: "server.failed", err }, "Server failed");
    void prisma.$disconnect().finally(() => {
      process.exitCode = 1;
    });
  });
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    const force = setTimeout(() => {
      if ("closeAllConnections" in server) server.closeAllConnections();
      void prisma.$disconnect().finally(() => process.exit(1));
    }, 10000);
    force.unref();
    server.close(() => {
      clearTimeout(force);
      void prisma.$disconnect().then(
        () => {
          logger.info({ event: "server.stopped" }, "Server stopped");
        },
        (err) => {
          logger.error({ err }, "Database disconnect failed");
          process.exitCode = 1;
        },
      );
    });
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  server.once("close", () => {
    process.removeListener("SIGTERM", shutdown);
    process.removeListener("SIGINT", shutdown);
  });
  return server;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  startServer().catch(async (err) => {
    logger.error(
      { event: "server.initialization_failed", err },
      "Initialization failed",
    );
    await prisma.$disconnect();
    process.exitCode = 1;
  });
