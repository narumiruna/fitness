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
const stop = (signal) => {
  interrupted = true;
  if (signal) process.exitCode = signal === "SIGINT" ? 130 : 143;
  child?.kill("SIGTERM");
};
const interrupt = () => stop("SIGINT");
const terminate = () => stop("SIGTERM");
process.on("SIGINT", interrupt);
process.on("SIGTERM", terminate);
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
    ["--import", "tsx", "apps/api/src/server.ts"],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        PASSKEY_ORIGIN: "https://localhost:8784",
        HOST: "127.0.0.1",
        PORT: String(port),
      },
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
  console.log(`Test TLS proxy upstream: http://127.0.0.1:${port}`);
  const [code] = await exited;
  if (!interrupted) process.exitCode = code ?? 1;
} finally {
  stop();
  if (child && child.exitCode === null && child.signalCode === null)
    await once(child, "exit");
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  await rm(directory, { recursive: true, force: true });
  process.removeListener("SIGINT", interrupt);
  process.removeListener("SIGTERM", terminate);
}
