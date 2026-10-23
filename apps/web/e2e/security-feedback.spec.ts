import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import bcrypt from "bcryptjs";
import { verifyPassword } from "../../api/src/lib/password";
import { prisma } from "../../api/src/lib/prisma";
import { dictionary } from "../src/lib/translations";

const user = {
  id: "security-feedback",
  username: "security-feedback",
  role: "ADMIN",
};
const locales = ["en", "zh-TW"] as const;
const viewports = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
];
const emptyWorkouts = {
  filteredWorkoutCount: 0,
  totalHistoryCount: 0,
  totalWorkoutCount: 0,
  workoutsThisMonth: 0,
  totals: [{ count: 0, volume: 0 }],
  totalPages: 1,
  currentPage: 1,
  workouts: [],
  exerciseOptions: [],
  templates: [],
  filters: { exerciseId: "", month: "", notesOnly: false, page: 1, q: "" },
  today: "2026-10-22",
  calendarWorkouts: [],
  planningTemplates: [],
  schedules: [],
};
const apiError = (code: string) => ({
  error: { code, requestId: "security-feedback" },
});
const fixtureUsers = [
  "security-feedback-password",
  "security-feedback-owner",
  "security-feedback-other",
];

async function mockSession(
  page: Page,
  locale: "en" | "zh-TW",
  signedIn: boolean,
) {
  await page.route("**/api/bootstrap", (route) =>
    route.fulfill({
      json: { user: signedIn ? user : null, hasUsers: true, locale },
    }),
  );
  await page.route("**/api/views/workouts", (route) =>
    route.fulfill({ json: emptyWorkouts }),
  );
  await page.route("**/api/views/passkeys", (route) =>
    route.fulfill({ json: { passkeys: [] } }),
  );
}

async function navigate(page: Page, path: string) {
  await page.evaluate((detail) => {
    window.dispatchEvent(new CustomEvent("fitness:navigate", { detail }));
  }, path);
}

async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/workouts$/);
}

test.afterAll(async () => {
  try {
    await prisma.user.deleteMany({ where: { username: { in: fixtureUsers } } });
  } finally {
    await prisma.$disconnect();
  }
});

for (const locale of locales) {
  const t = dictionary(locale);
  for (const signedIn of [false, true]) {
    for (const viewport of viewports) {
      test(`source links and unknown-route recovery: ${locale}, ${signedIn ? "signed in" : "guest"}, ${viewport.width}px`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        await mockSession(page, locale, signedIn);
        await page.goto("/source");
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(
          t("sourceLicense"),
        );
        const main = page.locator("main");
        await expect(
          main.getByRole("link", { name: t("sourceRepository"), exact: true }),
        ).toHaveAttribute("href", "https://github.com/narumiruna/fitness");
        await expect(
          main.getByRole("link", { name: t("sourceLicenseLink"), exact: true }),
        ).toHaveAttribute(
          "href",
          "https://github.com/narumiruna/fitness/blob/main/LICENSE",
        );
        await expect(main).toContainText("AGPL-3.0-only");
        expect(
          (await new AxeBuilder({ page }).include("main").analyze()).violations,
        ).toEqual([]);

        await navigate(page, "/security-feedback-unknown-route");
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(
          t("missingPageTitle"),
        );
        await expect(main.getByRole("alert")).toHaveText(t("missingPage"));
        await expect(
          main.getByRole("button", { name: t("tryAgain") }),
        ).toHaveCount(0);
        const recovery = main.getByRole("link", {
          name: t(signedIn ? "backToWorkouts" : "signIn"),
          exact: true,
        });
        await expect(recovery).toHaveAttribute(
          "href",
          signedIn ? "/workouts" : "/login",
        );
        await expect(main).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(recovery).toBeFocused();
        expect(
          (await new AxeBuilder({ page }).include("main").analyze()).violations,
        ).toEqual([]);
        await page.keyboard.press("Enter");
        await expect(page).toHaveURL(signedIn ? /\/workouts$/ : /\/login$/);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(
          t(signedIn ? "workouts" : "loginTitle"),
        );
        const direct = await page.goto("/security-feedback-unknown-route");
        expect(direct?.status()).toBe(
          process.env.NODE_ENV === "production" ? 404 : 200,
        );
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(
          t("missingPageTitle"),
        );
        await expect(
          main.getByRole("link", {
            name: t(signedIn ? "backToWorkouts" : "signIn"),
            exact: true,
          }),
        ).toHaveAttribute("href", signedIn ? "/workouts" : "/login");
      });
    }
  }

  test(`permanent read failures have distinct headings and local recovery: ${locale}`, async ({
    page,
  }) => {
    await mockSession(page, locale, true);
    const outcomes = [
      ["workouts/missing", 404],
      ["workouts/forbidden", 403],
      ["exercises/missing", 404],
    ] as const;
    for (const [path, status] of outcomes) {
      await page.route(`**/api/views/${path}`, (route) =>
        route.fulfill({
          status,
          json: apiError(status === 403 ? "FORBIDDEN" : "NOT_FOUND"),
        }),
      );
    }
    await page.goto("/account/password");
    for (const [path, status] of outcomes) {
      await navigate(page, `/${path}`);
      await expect(page.locator("main")).toBeFocused();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        t(status === 403 ? "accessDeniedTitle" : "missingPageTitle"),
      );
      await expect(page.locator("main").getByRole("alert")).toHaveText(
        t(status === 403 ? "accessDenied" : "missingPage"),
      );
      await expect(
        page.locator("main").getByRole("link", { name: t("backToWorkouts") }),
      ).toHaveAttribute("href", "/workouts");
      await expect(
        page.getByRole("button", { name: t("tryAgain") }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: t("signOut") }),
      ).toBeVisible();
    }
  });

  test(`password guidance, local validation, safe server errors, and security navigation: ${locale}`, async ({
    page,
  }) => {
    await mockSession(page, locale, true);
    let writes = 0;
    page.on("request", (request) => {
      if (
        new URL(request.url()).pathname === "/api/actions/changePasswordAction"
      )
        writes++;
    });
    await page.goto("/account/password");
    const security = page.getByRole("navigation", {
      name: t("accountSecurity"),
      exact: true,
    });
    await expect(security.getByRole("link")).toHaveText([
      t("changePassword"),
      t("passkeys"),
    ]);
    await expect(
      security.getByRole("link", { name: t("changePassword") }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      page.locator("main").getByRole("link", { name: t("mcpConnections") }),
    ).toHaveAttribute("href", "/account/connections");
    const current = page.getByLabel(t("currentPassword"), { exact: true });
    const next = page.getByLabel(t("newPassword"), { exact: true });
    const confirm = page.getByLabel(t("confirmPassword"), { exact: true });
    await expect(next).toHaveAccessibleDescription(t("passwordRequirements"));
    await expect(current).toHaveAttribute("autocomplete", "current-password");
    for (const field of [next, confirm])
      await expect(field).toHaveAttribute("autocomplete", "new-password");
    await current.fill("retained-current-password");
    await next.fill("short");
    await confirm.fill("short");
    await page
      .getByRole("button", { name: t("changePassword"), exact: true })
      .click();
    await expect(next).toHaveAttribute("aria-invalid", "true");
    await expect(next).toBeFocused();
    await expect(page.locator("main").getByRole("alert")).toHaveText(
      t("passwordRequirements"),
    );
    expect(writes).toBe(0);
    await next.fill("a-valid-new-password");
    await confirm.fill("a-different-new-password");
    await page
      .getByRole("button", { name: t("changePassword"), exact: true })
      .click();
    await expect(confirm).toBeFocused();
    await expect(confirm).toHaveAttribute("aria-invalid", "true");
    await expect(confirm).toHaveAccessibleDescription(t("passwordMismatch"));
    await expect(current).toHaveValue("retained-current-password");
    expect(writes).toBe(0);
    await confirm.fill("a-valid-new-password");
    await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
    await expect(confirm).not.toHaveAttribute("aria-invalid");

    await page.goto("/account/password?error=current");
    await expect(current).toHaveAccessibleDescription(
      t("currentPasswordError"),
    );
    await expect(current).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("main").getByRole("alert")).toHaveText(
      t("currentPasswordError"),
    );
    await page.goto("/account/password?error=invalid");
    await expect(page.locator("main").getByRole("alert")).toHaveText(
      t("changePasswordError"),
    );
    await expect(confirm).not.toHaveAttribute("aria-invalid");
    await expect(
      page.getByText(t("passwordMismatch"), { exact: true }),
    ).toHaveCount(0);
    await security
      .getByRole("link", { name: t("passkeys"), exact: true })
      .click();
    await expect(page).toHaveURL(/\/account\/passkeys$/);
    await expect(security.getByRole("link")).toHaveText([
      t("changePassword"),
      t("passkeys"),
    ]);
    await expect(
      security.getByRole("link", { name: t("passkeys") }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      page.locator("main").getByRole("link", { name: t("mcpConnections") }),
    ).toHaveAttribute("href", "/account/connections");
    expect(writes).toBe(0);
  });

  test(`named passkey removal preserves cancellation focus and surviving controls: ${locale}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockSession(page, locale, true);
    const keys = [
      {
        id: "feedback-first-key",
        name: "Travel device",
        createdAt: "2026-10-22T00:00:00.000Z",
        lastUsedAt: null,
      },
      {
        id: "feedback-other-key",
        name: "備用裝置",
        createdAt: "2026-10-22T00:00:00.000Z",
        lastUsedAt: null,
      },
    ];
    let removed = false;
    let writes = 0;
    await page.route("**/api/views/passkeys", (route) =>
      route.fulfill({ json: { passkeys: removed ? keys.slice(1) : keys } }),
    );
    await page.route("**/api/actions/deletePasskey", (route) => {
      writes++;
      expect(route.request().postDataJSON()).toEqual({ id: keys[0].id });
      removed = true;
      return route.fulfill({ json: {} });
    });
    await page.goto("/account/passkeys");
    const trigger = page.getByRole("button", {
      name: `${t("delete")}: ${keys[0].name}`,
      exact: true,
    });
    const dialog = page.getByRole("alertdialog");
    await trigger.click();
    await expect(dialog).toHaveAccessibleName(
      t("deletePasskeyTitle").replace("{name}", keys[0].name),
    );
    await expect(dialog).toHaveAccessibleDescription(
      t("deletePasskeyDescription"),
    );
    await expect(
      dialog.getByRole("button", { name: t("cancel"), exact: true }),
    ).toBeFocused();
    expect(
      (await new AxeBuilder({ page }).include('[role="alertdialog"]').analyze())
        .violations,
    ).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(writes).toBe(0);
    await trigger.press("Enter");
    await dialog
      .getByRole("button", { name: t("cancel"), exact: true })
      .click();
    await expect(trigger).toBeFocused();
    expect(writes).toBe(0);
    await trigger.click();
    await dialog
      .getByRole("button", { name: t("delete"), exact: true })
      .click();
    await expect(trigger).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: `${t("delete")}: ${keys[1].name}`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByRole("status")).toHaveText(
      t("passkeyDeleted").replace("{name}", keys[0].name),
    );
    await expect(
      page
        .locator("main")
        .getByRole("link", { name: t("changePassword"), exact: true }),
    ).toBeFocused();
    expect(writes).toBe(1);
  });

  for (const mode of ["register", "authenticate"] as const) {
    const registration = mode === "register";
    const buttonName = t(registration ? "addPasskey" : "passkeySignIn");
    test(`unsupported passkey environment sends no requests: ${locale}, ${mode}`, async ({
      page,
    }) => {
      await mockSession(page, locale, registration);
      await page.addInitScript(() =>
        Object.defineProperty(window, "PublicKeyCredential", {
          configurable: true,
          value: undefined,
        }),
      );
      let requests = 0;
      page.on("request", (request) => {
        if (/\/api\/actions\/.*[Pp]asskey/.test(request.url())) requests++;
      });
      await page.goto(registration ? "/account/passkeys" : "/login");
      await expect(page.locator("main").getByRole("alert")).toHaveText(
        t(
          registration
            ? "passkeyRegisterUnsupported"
            : "passkeyAuthenticateUnsupported",
        ),
      );
      await expect(
        page.getByRole("button", { name: buttonName, exact: true }),
      ).toBeDisabled();
      expect(requests).toBe(0);
    });

    test(`passkey feedback separates incomplete and failed requests without raw errors: ${locale}, ${mode}`, async ({
      page,
    }) => {
      await mockSession(page, locale, registration);
      await page.addInitScript(() => {
        const fail = async () => {
          throw new DOMException(
            "private-browser-error-do-not-display",
            "NotAllowedError",
          );
        };
        Object.defineProperty(navigator.credentials, "create", {
          configurable: true,
          value: fail,
        });
        Object.defineProperty(navigator.credentials, "get", {
          configurable: true,
          value: fail,
        });
      });
      let optionRequests = 0;
      let verifications = 0;
      let release = () => {};
      let observed = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const started = new Promise<void>((resolve) => {
        observed = resolve;
      });
      const optionsPath = registration
        ? "passkeyRegistrationOptions"
        : "passkeyAuthenticationOptions";
      await page.route(`**/api/actions/${optionsPath}`, async (route) => {
        optionRequests++;
        if (optionRequests > 1) {
          await route.fulfill({ status: 503, json: apiError("UNAVAILABLE") });
          return;
        }
        observed();
        await gate;
        await route.fulfill({
          json: {
            result: registration
              ? {
                  challenge: "dGVzdC1jaGFsbGVuZ2U",
                  rp: { name: "Fitness", id: "localhost" },
                  user: {
                    id: "dGVzdC11c2Vy",
                    name: "test-user",
                    displayName: "test-user",
                  },
                  pubKeyCredParams: [{ type: "public-key", alg: -7 }],
                }
              : { challenge: "dGVzdC1jaGFsbGVuZ2U", rpId: "localhost" },
          },
        });
      });
      await page.route(
        `**/api/actions/${registration ? "registerPasskey" : "authenticatePasskey"}`,
        (route) => {
          verifications++;
          return route.fulfill({ json: { result: false } });
        },
      );
      try {
        await page.goto(registration ? "/account/passkeys" : "/login");
        if (registration) {
          await page
            .getByLabel(t("passkeyName"), { exact: true })
            .fill("Retained device name");
          await page
            .getByLabel(t("currentPassword"), { exact: true })
            .fill("retained-password");
        }
        const button = page.getByRole("button", {
          name: buttonName,
          exact: true,
        });
        await button.click();
        await started;
        await expect(button).toBeDisabled();
        await button.evaluate((element) => {
          const form = element.closest("form");
          form?.requestSubmit();
          form?.requestSubmit();
        });
        expect(optionRequests).toBe(1);
        release();
        await expect(page.locator("main").getByRole("alert")).toHaveText(
          t(
            registration
              ? "passkeyRegisterIncomplete"
              : "passkeyAuthenticateIncomplete",
          ),
        );
        await expect(button).toBeEnabled();
        expect(verifications).toBe(0);
        await button.click();
        await expect(page.locator("main").getByRole("alert")).toHaveText(
          t(registration ? "passkeyRegisterError" : "passkeyAuthenticateError"),
        );
        expect(optionRequests).toBe(2);
        expect(verifications).toBe(0);
        await expect(page.locator("main")).not.toContainText(
          "private-browser-error-do-not-display",
        );
        if (registration) {
          await expect(
            page.getByLabel(t("passkeyName"), { exact: true }),
          ).toHaveValue("Retained device name");
          await expect(
            page.getByLabel(t("currentPassword"), { exact: true }),
          ).toHaveValue("retained-password");
        } else {
          await expect(
            page.getByLabel(t("currentPassword"), { exact: true }),
          ).toHaveCount(0);
          await expect(page).toHaveURL(/\/login$/);
        }
      } finally {
        release();
      }
    });
  }
}

for (const failure of ["unavailable", "network", "malformed"] as const) {
  test(`transient ${failure} read failure retains retry and restores route focus`, async ({
    page,
  }) => {
    await mockSession(page, "en", true);
    let reads = 0;
    await page.route("**/api/views/passkeys", (route) => {
      reads++;
      if (reads > 1) return route.fulfill({ json: { passkeys: [] } });
      if (failure === "network") return route.abort("failed");
      return failure === "malformed"
        ? route.fulfill({ json: { passkeys: "invalid" } })
        : route.fulfill({ status: 503, json: apiError("UNAVAILABLE") });
    });
    await page.goto("/account/passkeys");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Page could not be loaded",
    );
    await expect(page.locator("main").getByRole("alert")).toHaveText(
      "This page could not be loaded.",
    );
    await expect(
      page.locator("main").getByRole("link", { name: "Back to workouts" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Passkeys",
    );
    await expect(page.locator("main")).toBeFocused();
    expect(reads).toBe(2);
  });
}

test("401 clears private passkey state and drafts instead of showing permanent recovery", async ({
  page,
}) => {
  let authenticated = true;
  await page.route("**/api/bootstrap", (route) =>
    route.fulfill({
      json: {
        user: authenticated ? user : null,
        hasUsers: true,
        locale: "en",
      },
    }),
  );
  await page.route("**/api/views/passkeys", (route) =>
    route.fulfill({
      json: {
        passkeys: [
          {
            id: "private-passkey",
            name: "Private device name",
            createdAt: "2026-10-22T00:00:00.000Z",
            lastUsedAt: null,
          },
        ],
      },
    }),
  );
  await page.route("**/api/views/measurements", (route) => {
    authenticated = false;
    return route.fulfill({
      status: 401,
      json: apiError("AUTHENTICATION_REQUIRED"),
    });
  });
  await page.goto("/account/passkeys");
  await page
    .getByLabel("Passkey name", { exact: true })
    .fill("Private registration draft");
  await page.evaluate(() =>
    window.addEventListener("fitness:clear-drafts", () => {
      document.documentElement.dataset.privateStateCleared = "true";
    }),
  );
  await page.getByRole("link", { name: "Measurements", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator("html")).toHaveAttribute(
    "data-private-state-cleared",
    "true",
  );
  await expect(page.locator("main")).not.toContainText("Private device name");
  await expect(page.getByLabel("Passkey name", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator("main")).not.toContainText(
    "Private registration draft",
  );
});

test("real missing and foreign records do not expose private content", async ({
  page,
}) => {
  const password = "security-feedback-password";
  const passwordHash = await bcrypt.hash(password, 4);
  await prisma.user.create({
    data: { username: fixtureUsers[1], passwordHash },
  });
  const other = await prisma.user.create({
    data: { username: fixtureUsers[2], passwordHash },
  });
  const foreign = await prisma.workout.create({
    data: {
      userId: other.id,
      date: new Date(2026, 9, 22),
      title: "Private foreign workout",
      notes: "Private foreign notes",
    },
  });
  await login(page, fixtureUsers[1], password);
  for (const path of [
    "/workouts/security-feedback-missing",
    `/workouts/${foreign.id}`,
    "/exercises/security-feedback-missing",
  ]) {
    await navigate(page, path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Page or record not found",
    );
    await expect(
      page.locator("main").getByRole("link", { name: "Back to workouts" }),
    ).toHaveAttribute("href", "/workouts");
    await expect(page.locator("main")).not.toContainText("Private foreign");
    await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(
      0,
    );
  }
});

test("password current-error mapping, failed-save retention, and successful single change", async ({
  page,
  context,
}) => {
  const password = "security-feedback-current-password";
  const passwordPrefix = "密".repeat(24);
  const replacement = `${passwordPrefix}security-feedback-new-password`;
  const account = await prisma.user.create({
    data: {
      username: fixtureUsers[0],
      passwordHash: await bcrypt.hash(password, 4),
    },
  });
  await login(page, account.username, password);
  const oldSession = (await context.cookies()).find(
    (cookie) => cookie.name === "fitness_session",
  );
  await page.goto("/account/password");
  let writes = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/actions/changePasswordAction")
      writes++;
  });
  const current = page.getByLabel("Current password", { exact: true });
  const next = page.getByLabel("New password", { exact: true });
  const confirm = page.getByLabel("Confirm password", { exact: true });
  const submit = page.getByRole("button", {
    name: "Change password",
    exact: true,
  });
  await current.fill("wrong-current-password");
  await next.fill(replacement);
  await confirm.fill(replacement);
  await submit.click();
  await expect(page).toHaveURL(/error=current/);
  await expect(current).toHaveAccessibleDescription(
    "The current password is incorrect. Enter it again.",
  );
  await expect(next).toHaveValue(replacement);
  await expect(confirm).toHaveValue(replacement);
  expect(writes).toBe(1);
  await current.fill(password);
  await confirm.fill("mismatched-password");
  await submit.click();
  await expect(confirm).toBeFocused();
  await expect(confirm).toHaveAccessibleDescription(
    "The passwords do not match. Enter the new password again.",
  );
  expect(writes).toBe(1);
  await confirm.fill(replacement);
  await page.route("**/api/actions/changePasswordAction", (route) =>
    route.abort("failed"),
  );
  await submit.click();
  await expect(page.locator("main").getByRole("alert")).toHaveText(
    dictionary("en")("saveFailed"),
  );
  for (const [field, value] of [
    [current, password],
    [next, replacement],
    [confirm, replacement],
  ] as const) {
    await expect(field).toHaveValue(value);
  }
  expect(writes).toBe(2);
  await page.unroute("**/api/actions/changePasswordAction");
  let release = () => {};
  let observed = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    observed = resolve;
  });
  await page.route("**/api/actions/changePasswordAction", async (route) => {
    observed();
    await gate;
    await route.continue();
  });
  try {
    await submit.click();
    await started;
    await expect(current).toBeDisabled();
    await submit.evaluate((button) => {
      button.closest("form")?.requestSubmit();
      button.closest("form")?.requestSubmit();
    });
    expect(writes).toBe(3);
    release();
    await expect(page.getByRole("status")).toHaveText("Password changed.");
    expect(writes).toBe(3);
    const newSession = (await context.cookies()).find(
      (cookie) => cookie.name === "fitness_session",
    );
    expect(newSession?.value).not.toBe(oldSession?.value);
    expect(await prisma.session.count({ where: { userId: account.id } })).toBe(
      1,
    );
    const saved = await prisma.user.findUniqueOrThrow({
      where: { id: account.id },
    });
    expect(saved.passwordHash).toMatch(/^bcrypt-sha256:v1:/);
    expect(await verifyPassword(replacement, saved.passwordHash)).toBe(true);
    expect(
      await verifyPassword(`${passwordPrefix}different`, saved.passwordHash),
    ).toBe(false);
  } finally {
    release();
  }
});
