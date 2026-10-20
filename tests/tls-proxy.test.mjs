import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { get } from "node:https";
import test from "node:test";
import { createTestTlsProxy } from "./fixtures/tls-proxy.mjs";

test("isolated image TLS proxy preserves Origin, cookies, paths, and response headers", async () => {
  const upstream = createServer((request, response) => {
    response.writeHead(200, {
      "content-type": "application/json",
      "set-cookie": "fixture=ok; HttpOnly; Secure; Path=/",
    });
    response.end(
      JSON.stringify({
        origin: request.headers.origin,
        cookie: request.headers.cookie,
        path: request.url,
      }),
    );
  });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  let tls;
  try {
    tls = await createTestTlsProxy(upstream.address().port);
    const result = await new Promise((resolve, reject) => {
      const request = get(
        `${tls.url}/api/fixture?q=1`,
        {
          rejectUnauthorized: false,
          headers: { origin: tls.url, cookie: "fixture=request" },
        },
        (response) => {
          const encrypted = response.socket.encrypted;
          let body = "";
          response.on("data", (chunk) => {
            body += chunk;
          });
          response.on("end", () =>
            resolve({
              body: JSON.parse(body),
              headers: response.headers,
              encrypted,
            }),
          );
        },
      );
      request.on("error", reject);
    });
    assert.equal(result.encrypted, true);
    assert.deepEqual(result.body, {
      origin: tls.url,
      cookie: "fixture=request",
      path: "/api/fixture?q=1",
    });
    assert.deepEqual(result.headers["set-cookie"], [
      "fixture=ok; HttpOnly; Secure; Path=/",
    ]);
  } finally {
    await tls?.stop();
    upstream.closeAllConnections();
    await new Promise((resolve) => upstream.close(resolve));
  }
});
