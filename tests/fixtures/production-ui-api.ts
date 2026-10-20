import { serve } from "@hono/node-server";
import { Hono } from "hono";

// The TLS supervisor lifecycle tests use a database-free Hono child.
// Production browser tests use apps/api/src/server.ts, without this fixture.
const app = new Hono();
app.get("/favicon.ico", (c) => {
  c.header("x-test-upstream", "hono-lifecycle-fixture");
  return c.body("fixture", 200, { "content-type": "image/x-icon" });
});
const server = serve({
  fetch: app.fetch,
  hostname: process.env.HOST,
  port: Number(process.env.PORT),
});
const stop = () => {
  server.close();
  if ("closeAllConnections" in server) server.closeAllConnections();
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
