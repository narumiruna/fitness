import { spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { request } from "node:http";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Disposable TLS termination for isolated image tests, never a production proxy.
export async function createTestTlsProxy(upstreamPort) {
  const directory = await mkdtemp(join(tmpdir(), "fitness-image-tls-"));
  let server;
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
      throw new Error("Test certificate generation failed.");
    server = createServer(
      { key: await readFile(key), cert: await readFile(cert) },
      (req, res) => {
        const upstream = request(
          {
            hostname: "127.0.0.1",
            port: upstreamPort,
            path: req.url,
            method: req.method,
            headers: req.headers,
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
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    return {
      url: `https://localhost:${server.address().port}`,
      async stop() {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
        await rm(directory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    if (server?.listening) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
