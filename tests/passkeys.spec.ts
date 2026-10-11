import { expect, test } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

const username = "passkey-test";
const password = "passkey-test-password";

test.afterAll(async () => {
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
  try {
    await page.goto("/login");
    await page.getByLabel("Username", { exact: true }).fill(username);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/workouts$/);
    await page.goto("/account/password");
    await page.getByRole("link", { name: "Passkeys", exact: true }).click();
    await expect(page).toHaveURL(/\/account\/passkeys$/);
    await page.getByLabel("Passkey name").fill("Test device");
    await page.getByLabel("Current password").fill("wrong");
    await page.getByRole("button", { name: "Add passkey" }).click();
    await expect(page.locator("main").getByRole("alert")).toBeVisible();
    expect(await prisma.passkey.count({ where: { userId: user.id } })).toBe(0);
    await page.getByLabel("Current password").fill(password);
    await page.getByRole("button", { name: "Add passkey" }).click();
    await expect(page.getByRole("status")).toHaveText("Passkey added.");
    expect(await prisma.passkey.count({ where: { userId: user.id } })).toBe(1);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    // Expire the issued challenge before the verification request reaches the server.
    await page.route("**/login", async (route) => {
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
    await page.unroute("**/login");

    await page.route("**/login", async (route) => {
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
    await page.unroute("**/login");

    let replay: { headers: Record<string, string>; data: string } | undefined;
    await page.route("**/login", async (route) => {
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
    await context.request.post("/login", replay);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);
    const session = (await context.cookies()).find(
      (cookie) => cookie.name === "fitness_session",
    );
    expect(session?.httpOnly).toBe(true);
    await page.goto("/account/passkeys");
    await page.getByRole("button", { name: "Delete: Test device" }).click();
    await expect(page.getByText("No passkeys registered.")).toBeVisible();
    expect(await prisma.passkey.count({ where: { userId: user.id } })).toBe(0);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByRole("button", { name: "Sign in with a passkey" }).click();
    await expect(page.locator("main").getByRole("alert")).toBeVisible();
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
  } finally {
    await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId });
  }
});
