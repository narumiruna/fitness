import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { request } from "node:http";
import { createServer } from "node:https";
import { createServer as createPortServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Test-only TLS termination. Keep production origin checks and secure cookies enabled.
if (
  process.env.NODE_ENV !== "production" ||
  !/^postgresql:\/\/fitness:fitness@127\.0\.0\.1:\d+\/fitness$/.test(
    process.env.DATABASE_URL ?? "",
  )
) {
  throw new Error(
    "Run the production server through npm run test:ui:production.",
  );
}
const directory = await mkdtemp(join(tmpdir(), "fitness-ui-tls-"));
let child;
let server;
let interrupted = false;
const stop = () => {
  interrupted = true;
  child?.kill("SIGTERM");
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
try {
  const key = join(directory, "key.pem");
  const cert = join(directory, "cert.pem");
  const result = spawnSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-days",
      "1",
      "-subj",
      "/CN=localhost",
      "-addext",
      "subjectAltName=DNS:localhost",
      "-keyout",
      key,
      "-out",
      cert,
    ],
    { encoding: "utf8", timeout: 30_000 },
  );
  if (result.status !== 0)
    throw new Error(result.stderr || result.error?.message);

  const reservation = createPortServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  if (interrupted) throw new Error("Test server startup interrupted.");
  child = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "-H",
      "127.0.0.1",
      "-p",
      String(port),
    ],
    {
      stdio: "inherit",
      env: { ...process.env, PASSKEY_ORIGIN: "https://localhost:8784" },
    },
  );
  const exited = once(child, "exit");
  server = createServer(
    { key: await readFile(key), cert: await readFile(cert) },
    (req, res) => {
      const upstream = request(
        {
          hostname: "127.0.0.1",
          port,
          path: req.url,
          method: req.method,
          headers: {
            ...req.headers,
            "x-forwarded-proto": "https",
            "x-forwarded-host": req.headers.host,
          },
        },
        (response) => {
          res.writeHead(response.statusCode, response.headers);
          response.pipe(res);
        },
      );
      upstream.on("error", () => {
        if (!res.headersSent) res.writeHead(502);
        res.end();
      });
      req.on("aborted", () => upstream.destroy());
      res.on("close", () => upstream.destroy());
      req.pipe(upstream);
    },
  );
  server.listen(8784, "127.0.0.1");
  await once(server, "listening");
  const [code] = await exited;
  process.exitCode = code ?? 0;
} finally {
  stop();
  if (child && child.exitCode === null && child.signalCode === null)
    await once(child, "exit");
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  await rm(directory, { recursive: true, force: true });
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
}
