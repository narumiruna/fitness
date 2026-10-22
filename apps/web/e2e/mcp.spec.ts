import { createHash, randomBytes } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import bcrypt from "bcryptjs";
import { seedMcpClient } from "../../../tests/fixtures/mcp-client";
import { prisma } from "../../api/src/lib/prisma";

const username = "mcp-browser";
const password = "mcp-browser-password";
const callback = "http://127.0.0.1:8765/callback";
const requestId = "a".repeat(43);
const readLabel =
  "Read your workout records, metrics, and the exercise catalog.";
const writeLabel =
  "Create completed workouts. This does not permit editing, deletion, or administrator access.";

function authorizationURL(origin: string, scopes = "fitness:read") {
  const verifier = randomBytes(32).toString("base64url");
  const params = new URLSearchParams({
    response_type: "code",
    client_id: "fitness-cli",
    redirect_uri: callback,
    resource: `${origin}/mcp`,
    scope: scopes,
    state: randomBytes(24).toString("base64url"),
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  });
  return { path: `/oauth/authorize?${params}`, verifier, params };
}

async function signIn(page: Page) {
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

async function login(page: Page) {
  await page.goto("/login");
  await signIn(page);
  await expect(page).toHaveURL(/\/workouts$/);
}

async function captureCallback(page: Page) {
  await page.route(`${callback}**`, (route) =>
    route.fulfill({
      contentType: "text/plain",
      body: "Agent callback received.",
    }),
  );
}

test.beforeAll(async () => {
  await seedMcpClient();
  await prisma.user.create({
    data: { username, passwordHash: await bcrypt.hash(password, 4) },
  });
});

test.beforeEach(async () => {
  const user = await prisma.user.findUniqueOrThrow({ where: { username } });
  await prisma.mcpGrant.deleteMany({ where: { userId: user.id } });
});

test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { username } });
  await prisma.$disconnect();
});

test("anonymous authorization returns after login, grants read only, and revokes access", async ({
  page,
  context,
  baseURL,
}) => {
  if (!baseURL) throw new Error("Browser base URL is required.");
  const authorization = authorizationURL(baseURL);
  await captureCallback(page);
  await page.goto(authorization.path);
  await expect(page).toHaveURL(/\/oauth\/consent\?request=[A-Za-z0-9_-]+$/);
  const consentURL = page.url();
  await page
    .getByRole("link", { name: "Sign in", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/login$/);
  expect(
    await page.evaluate(() => window.history.state?.usr?.mcpConsentRequest),
  ).toBe(new URL(consentURL).searchParams.get("request"));
  // A failed password must keep the exact pending consent request.
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill("incorrect-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Invalid username or password.",
  );
  await signIn(page);
  await expect(page).toHaveURL(consentURL);
  await expect(
    page.getByRole("heading", {
      level: 2,
      name: "Fitness CLI test client",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText(readLabel, { exact: true })).toBeVisible();
  await expect(page.getByText(writeLabel, { exact: true })).toHaveCount(0);
  await expect(
    page.getByText(/Your records will be sent to your selected agent provider/),
  ).toBeVisible();
  await expect(page.getByRole("img")).toHaveCount(0);
  await page.getByRole("button", { name: "Allow access", exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`^${callback.replaceAll(".", "\\.")}\\?`),
  );
  const result = new URL(page.url());
  expect(result.searchParams.get("state")).toBe(
    authorization.params.get("state"),
  );
  expect(result.searchParams.has("code")).toBe(true);
  expect(result.searchParams.has("access_token")).toBe(false);
  const exchangeForm = {
    grant_type: "authorization_code",
    client_id: "fitness-cli",
    redirect_uri: callback,
    code: result.searchParams.get("code") ?? "",
    code_verifier: authorization.verifier,
    resource: `${baseURL}/mcp`,
  };
  const exchange = await context.request.post("/oauth/token", {
    form: exchangeForm,
  });
  expect(exchange.status()).toBe(200);
  const token: unknown = await exchange.json();
  if (
    !token ||
    typeof token !== "object" ||
    !("access_token" in token) ||
    typeof token.access_token !== "string"
  )
    throw new Error(
      "Expected an access token from the authorization exchange.",
    );
  await page.goto("/account/password");
  await page
    .getByRole("link", { name: "Connected agents", exact: true })
    .click();
  await expect(page.getByText(readLabel, { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Revoke access", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(page.getByText("No connected agents.")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Revoke access", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Revoke access", exact: true })
    .click();
  await expect(page.getByText("No connected agents.")).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Agent access revoked.");
  const revoked = await context.request.post("/mcp", {
    headers: { Authorization: `Bearer ${token.access_token}` },
    data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
  });
  expect(revoked.status()).toBe(401);

  // A fresh code cannot be redeemed with another client's PKCE verifier.
  await page.goto(authorizationURL(baseURL).path);
  await page.getByRole("button", { name: "Allow access", exact: true }).click();
  await expect(page).toHaveURL(/\/callback\?/);
  const invalidExchange = await context.request.post("/oauth/token", {
    form: {
      ...exchangeForm,
      code: new URL(page.url()).searchParams.get("code") ?? "",
      code_verifier: randomBytes(32).toString("base64url"),
    },
  });
  expect(invalidExchange.status()).toBe(400);
});

test("passkey login returns to write-only consent and does not add read permission", async ({
  page,
  context,
  baseURL,
}) => {
  if (!baseURL) throw new Error("Browser base URL is required.");
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send(
    "WebAuthn.addVirtualAuthenticator",
    {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    },
  );
  try {
    await login(page);
    await page.goto("/account/passkeys");
    await page.getByLabel("Passkey name").fill("MCP browser test");
    await page.getByLabel("Current password").fill(password);
    await page
      .getByRole("button", { name: "Add passkey", exact: true })
      .click();
    await expect(page.getByRole("status")).toHaveText("Passkey added.");
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await captureCallback(page);
    await page.goto(authorizationURL(baseURL, "fitness:write").path);
    await expect(page).toHaveURL(/\/oauth\/consent\?request=[A-Za-z0-9_-]+$/);
    const consentURL = page.url();
    await page
      .locator("main")
      .getByRole("link", { name: "Sign in", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Sign in with a passkey", exact: true })
      .click();
    await expect(page).toHaveURL(consentURL);
    await expect(page.getByText(writeLabel, { exact: true })).toBeVisible();
    await expect(page.getByText(readLabel, { exact: true })).toHaveCount(0);
    await page
      .getByRole("button", { name: "Allow access", exact: true })
      .click();
    await expect(page).toHaveURL(/\/callback\?/);
    await page.goto("/account/connections");
    await expect(page.getByText(writeLabel, { exact: true })).toBeVisible();
    await expect(page.getByText(readLabel, { exact: true })).toHaveCount(0);
  } finally {
    await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId });
  }
});

test("Traditional Chinese consent shows explicit write scope and denial creates no connection", async ({
  page,
  baseURL,
}) => {
  if (!baseURL) throw new Error("Browser base URL is required.");
  await login(page);
  await captureCallback(page);
  const authorization = authorizationURL(baseURL, "fitness:read fitness:write");
  await page.goto(authorization.path);
  await expect(page.getByText(writeLabel, { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Language", exact: true }).click();
  await page.getByRole("option", { name: "正體中文", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "連接代理程式", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("建立已完成的訓練。不包含編輯、刪除或管理員權限。", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/你的紀錄將傳送給你選擇的代理程式供應商/),
  ).toBeVisible();
  await page.getByRole("button", { name: "拒絕存取", exact: true }).click();
  await expect(page).toHaveURL(/\/callback\?/);
  const result = new URL(page.url());
  expect(result.searchParams.get("error")).toBe("access_denied");
  expect(result.searchParams.has("code")).toBe(false);
  await page.goto("/account/connections");
  await expect(
    page.getByRole("heading", { name: "已連接的代理程式", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("尚未連接代理程式。", { exact: true }),
  ).toBeVisible();
});

test("authorization rejects unregistered callbacks and missing PKCE without a redirect", async ({
  context,
  baseURL,
}) => {
  if (!baseURL) throw new Error("Browser base URL is required.");
  for (const invalid of ["callback", "pkce"]) {
    const authorization = authorizationURL(baseURL);
    if (invalid === "callback")
      authorization.params.set(
        "redirect_uri",
        "https://attacker.invalid/callback",
      );
    else authorization.params.delete("code_challenge");
    const response = await context.request.get(
      `/oauth/authorize?${authorization.params}`,
      { maxRedirects: 0 },
    );
    expect(response.status()).toBe(400);
    expect(response.headers().location).toBeUndefined();
  }
});

test("invalid consent and foreign login returns cannot navigate outside Fitness", async ({
  page,
}) => {
  await page.goto(
    "/oauth/consent?request=not-valid&access_token=hidden-secret",
  );
  await expect(page.getByRole("alert")).toContainText(
    "This access request is invalid",
  );
  await expect(page.getByRole("button", { name: "Allow access" })).toHaveCount(
    0,
  );
  await expect(page.locator("main")).not.toContainText("hidden-secret");
  await page.goto("/account/connections");
  await expect(page).toHaveURL(/\/login$/);
  await page.goto(
    "/login?returnTo=https%3A%2F%2Fattacker.invalid%2F&return=%2F%2Fattacker.invalid",
  );
  await page.evaluate(() => {
    window.history.replaceState(
      {
        ...window.history.state,
        usr: { mcpConsentRequest: "../../attacker.invalid" },
      },
      "",
      window.location.href,
    );
  });
  await page.reload();
  await signIn(page);
  await expect(page).toHaveURL(/\/workouts$/);
});

test("consent and connection errors are safe and retryable, with explicit revoke confirmation", async ({
  page,
}) => {
  await login(page);
  let consentReads = 0;
  await page.route(`**/api/mcp/authorization/${requestId}`, async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 500,
        json: { error: { code: "INTERNAL_ERROR", requestId: "test" } },
      });
    } else {
      consentReads++;
      await route.fulfill(
        consentReads === 1
          ? {
              status: 410,
              json: { error: { code: "NOT_FOUND", requestId: "test" } },
            }
          : {
              json: {
                requestId,
                clientName: "<img src=x onerror=alert(1)>",
                clientId: "https://untrusted.example/client.json",
                scopes: ["fitness:write"],
                resource: "http://localhost:8784/mcp",
                expiresAt: new Date(Date.now() + 300_000).toISOString(),
              },
            },
      );
    }
  });
  await page.goto(`/oauth/consent?request=${requestId}`);
  await expect(page.getByRole("alert")).toContainText(
    "This access request is invalid",
  );
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(
    "<img src=x onerror=alert(1)>",
  );
  await expect(page.locator("main img")).toHaveCount(0);
  await expect(
    page.getByText("Client ID: https://untrusted.example/client.json", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "The client supplies its name. Verify its client ID before you approve access.",
      { exact: true },
    ),
  ).toBeVisible();
  const consentHtml = await page.request.get(
    `/oauth/consent?request=${requestId}`,
  );
  expect(consentHtml.headers()["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
  expect(consentHtml.headers()["x-frame-options"]).toBe("DENY");
  await expect(page.getByText(readLabel, { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Deny access", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Could not submit your decision",
  );
  await expect(
    page.getByRole("button", { name: "Allow access", exact: true }),
  ).toBeEnabled();

  let connectionReads = 0;
  let revocations = 0;
  await page.route("**/api/mcp/connections", async (route) => {
    connectionReads++;
    await route.fulfill(
      connectionReads === 1
        ? { status: 500, json: {} }
        : {
            json: {
              connections:
                revocations > 1
                  ? []
                  : [
                      {
                        id: "fixture",
                        clientName: "Test agent",
                        clientId: "https://untrusted.example/client.json",
                        scopes: ["fitness:read"],
                        createdAt: new Date().toISOString(),
                        expiresAt: new Date(Date.now() + 300_000).toISOString(),
                      },
                    ],
            },
          },
    );
  });
  await page.route("**/api/mcp/connections/fixture/revoke", async (route) => {
    revocations++;
    await route.fulfill(
      revocations === 1
        ? { status: 500, json: {} }
        : { json: { revoked: true } },
    );
  });
  await page.goto("/account/connections");
  await expect(page.getByRole("alert")).toHaveText(
    "This page could not be loaded.",
  );
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page
    .getByRole("button", { name: "Revoke access", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  expect(revocations).toBe(0);
  for (let attempt = 0; attempt < 2; attempt++) {
    await page
      .getByRole("button", { name: "Revoke access", exact: true })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Revoke access", exact: true })
      .click();
    if (attempt === 0)
      await expect(page.getByRole("alert")).toHaveText(
        "Could not revoke access. Try again.",
      );
  }
  await expect(
    page.getByText("No connected agents.", { exact: true }),
  ).toBeVisible();
});
