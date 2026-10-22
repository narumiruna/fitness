import { expect, test } from "@playwright/test";
import bcrypt from "bcryptjs";
import { PASSKEY_CHALLENGE_LIMIT } from "../../api/src/lib/passkey-challenges";
import { prisma } from "../../api/src/lib/prisma";

const username = "passkey-test";
const password = "passkey-test-password";

test.afterAll(async () => {
  await prisma.passkeyChallenge.deleteMany();
  await prisma.user.deleteMany({ where: { username } });
  await prisma.$disconnect();
});

test("passkey registration, password checks, expiry, sign-in, replay, and removal", async ({
  page,
  context,
}) => {
  const user = await prisma.user.create({
    data: {
      username,
      passwordHash: await bcrypt.hash(password, 4),
    },
  });
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
  let releaseRemoval = () => {};
  try {
    await page.goto("/login");
    await page.getByLabel("Username", { exact: true }).fill(username);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/workouts$/);
    await page.goto("/account/password");
    await page.getByRole("link", { name: "Passkeys", exact: true }).click();
    await expect(page).toHaveURL(/\/account\/passkeys$/);
    await page.getByLabel("Passkey name").fill("   ");
    await page.getByLabel("Current password").fill(password);
    const [invalidNameResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname ===
            "/api/actions/passkeyRegistrationOptions",
      ),
      page.getByRole("button", { name: "Add passkey" }).click(),
    ]);
    await expect(page.locator("main").getByRole("alert")).toBeVisible();
    expect(invalidNameResponse.status()).toBe(400);
    expect(await invalidNameResponse.json()).toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
    expect(
      (await cdp.send("WebAuthn.getCredentials", { authenticatorId }))
        .credentials,
    ).toHaveLength(0);
    expect(
      await prisma.passkeyChallenge.count({ where: { userId: user.id } }),
    ).toBe(0);
    expect(await prisma.passkey.count({ where: { userId: user.id } })).toBe(0);
    await page.getByLabel("Passkey name").fill("  Test device  ");
    await page.getByLabel("Current password").fill("wrong");
    await page.getByRole("button", { name: "Add passkey" }).click();
    await expect(page.locator("main").getByRole("alert")).toBeVisible();
    expect(await prisma.passkey.count({ where: { userId: user.id } })).toBe(0);
    await page.getByLabel("Current password").fill(password);
    await page.getByRole("button", { name: "Add passkey" }).click();
    await expect(page.getByRole("status")).toHaveText("Passkey added.");
    expect(await prisma.passkey.count({ where: { userId: user.id } })).toBe(1);
    expect(
      (await prisma.passkey.findFirstOrThrow({ where: { userId: user.id } }))
        .name,
    ).toBe("Test device");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    // Expire the issued challenge before the verification request reaches the server.
    await page.route("**/api/actions/authenticatePasskey", async (route) => {
      if (route.request().postData()?.includes("authenticatorData")) {
        await prisma.passkeyChallenge.updateMany({
          data: { expiresAt: new Date(0) },
        });
      }
      await route.continue();
    });
    await page.getByRole("button", { name: "Sign in with a passkey" }).click();
    await expect(page.locator("main").getByRole("alert")).toBeVisible();
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    await page.unroute("**/api/actions/authenticatePasskey");

    await page.route("**/api/actions/authenticatePasskey", async (route) => {
      const body = route.request().postData();
      if (body?.includes("authenticatorData")) {
        const modified = body.replace(
          /"signature":"[^"]+"/,
          '"signature":"AAAA"',
        );
        expect(modified).not.toBe(body);
        await route.continue({ postData: modified });
      } else {
        await route.continue();
      }
    });
    await page.getByRole("button", { name: "Sign in with a passkey" }).click();
    await expect(page.locator("main").getByRole("alert")).toBeVisible();
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    await page.unroute("**/api/actions/authenticatePasskey");

    let replay: { headers: Record<string, string>; data: string } | undefined;
    await page.route("**/api/actions/authenticatePasskey", async (route) => {
      const request = route.request();
      const data = request.postData();
      if (data?.includes("authenticatorData"))
        replay = { headers: await request.allHeaders(), data };
      await route.continue();
    });
    await page.getByRole("button", { name: "Sign in with a passkey" }).click();
    await expect(page).toHaveURL(/\/workouts$/);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);
    expect(replay).toBeDefined();
    if (!replay) throw new Error("Verification request not captured.");
    await context.request.post("/api/actions/authenticatePasskey", replay);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);
    const session = (await context.cookies()).find(
      (cookie) => cookie.name === "fitness_session",
    );
    expect(session?.httpOnly).toBe(true);
    expect(session?.secure).toBe(process.env.NODE_ENV === "production");
    await page.goto("/account/passkeys");
    let removals = 0;
    let removalStarted = () => {};
    const started = new Promise<void>((resolve) => {
      removalStarted = resolve;
    });
    const removalGate = new Promise<void>((resolve) => {
      releaseRemoval = resolve;
    });
    await page.route("**/api/actions/deletePasskey", async (route) => {
      removals++;
      if (removals === 1) {
        await route.fulfill({
          status: 503,
          json: { error: { code: "UNAVAILABLE", requestId: "removal-test" } },
        });
      } else {
        removalStarted();
        await removalGate;
        await route.continue();
      }
    });
    const remove = page.getByRole("button", { name: "Delete: Test device" });
    const dialog = page.getByRole("alertdialog");
    await remove.click();
    await expect(dialog).toHaveAccessibleName("Delete passkey: Test device?");
    await expect(dialog).toContainText(
      "Keep your password for account recovery.",
    );
    const cancel = dialog.getByRole("button", { name: "Cancel", exact: true });
    await expect(cancel).toBeFocused();
    await cancel.click();
    await expect(dialog).toHaveCount(0);
    await expect(remove).toBeFocused();
    expect(removals).toBe(0);
    expect(await prisma.passkey.count({ where: { userId: user.id } })).toBe(1);

    await remove.press("Enter");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(remove).toBeFocused();
    expect(removals).toBe(0);
    expect(await prisma.passkey.count({ where: { userId: user.id } })).toBe(1);

    await remove.click();
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "Could not remove this passkey. Retry, or cancel and reload to check its status. Keep your password for account recovery.",
    );
    await expect(cancel).toBeEnabled();
    expect(removals).toBe(1);
    expect(await prisma.passkey.count({ where: { userId: user.id } })).toBe(1);
    await cancel.click();
    await expect(remove).toBeFocused();

    await remove.click();
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();
    await started;
    await expect(cancel).toBeDisabled();
    await expect(
      dialog.getByRole("button", { name: "Delete", exact: true }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await dialog.locator("form").evaluate((form: HTMLFormElement) => {
      form.requestSubmit();
      form.requestSubmit();
    });
    expect(removals).toBe(2);
    expect(await prisma.passkey.count({ where: { userId: user.id } })).toBe(1);
    releaseRemoval();
    await expect(page.getByText("No passkeys registered.")).toBeVisible();
    await expect(page.getByRole("status")).toHaveText(
      "Passkey removed: Test device.",
    );
    await expect(
      page.getByRole("link", { name: "Change password", exact: true }),
    ).toBeFocused();
    expect(removals).toBe(2);
    expect(await prisma.passkey.count({ where: { userId: user.id } })).toBe(0);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByRole("button", { name: "Sign in with a passkey" }).click();
    await expect(page.locator("main").getByRole("alert")).toBeVisible();
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
  } finally {
    releaseRemoval();
    await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId });
  }
});

test("anonymous option requests without cookies cannot grow a full challenge store", async ({
  page,
  context,
}) => {
  await prisma.passkeyChallenge.deleteMany();
  await prisma.passkeyChallenge.createMany({
    data: Array.from({ length: PASSKEY_CHALLENGE_LIMIT }, (_, index) => ({
      tokenHash: `capacity-${index}`,
      challenge: "test-challenge",
      purpose: "authenticate",
      expiresAt: new Date(Date.now() + 300_000),
    })),
  });
  await page.goto("/login");
  let issuance: { headers: Record<string, string>; data: string } | undefined;
  page.on("request", async (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname ===
        "/api/actions/passkeyAuthenticationOptions"
    ) {
      issuance = { headers: await request.allHeaders(), data: "{}" };
    }
  });
  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await expect(page.locator("main").getByRole("alert")).toBeVisible();
  expect(
    (await context.cookies()).some(
      (cookie) => cookie.name === "fitness_passkey_challenge",
    ),
  ).toBe(false);
  expect(issuance).toBeDefined();
  if (!issuance) throw new Error("Option request not captured.");
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await context.request.post(
      "/api/actions/passkeyAuthenticationOptions",
      {
        ...issuance,
        headers: { ...issuance.headers, cookie: "" },
      },
    );
    expect(response.status()).toBe(503);
  }
  expect(await prisma.passkeyChallenge.count()).toBe(PASSKEY_CHALLENGE_LIMIT);
});
