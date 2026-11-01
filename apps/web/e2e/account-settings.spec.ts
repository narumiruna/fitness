import AxeBuilder from "@axe-core/playwright";
import {
  type Bootstrap,
  mcpConnectionsSchema,
  type PasskeysView,
} from "@narumitw/fitness-contracts";
import { expect, type Page, test } from "@playwright/test";
import type { Locale } from "../src/lib/locales";
import { dictionary } from "../src/lib/translations";

const locales = ["en", "zh-TW"] as const;
const viewports = [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 320, height: 844 },
];
const accountPages = [
  { path: "/account/password", title: "changePassword" },
  { path: "/account/passkeys", title: "passkeys" },
  { path: "/account/connections", title: "mcpConnections" },
] as const;
const savedPasskey: PasskeysView["passkeys"][number] = {
  id: "account-settings-passkey",
  name: "Saved device",
  createdAt: "2026-10-22T00:00:00.000Z",
  lastUsedAt: null,
};
const savedAgent = {
  id: "account-settings-agent",
  clientName: "Saved agent",
  clientId: "https://agent.example/client.json",
  scopes: ["fitness:read"],
  createdAt: "2026-10-22T00:00:00.000Z",
  expiresAt: "2099-10-22T00:00:00.000Z",
};

async function mockAccount(page: Page, locale: Locale) {
  await page.route("**/api/bootstrap", (route) =>
    route.fulfill({
      json: {
        user: { id: "account-settings", username: "settings", role: "USER" },
        hasUsers: true,
        locale,
      } satisfies Bootstrap,
    }),
  );
  await page.route("**/api/views/passkeys", (route) =>
    route.fulfill({
      json: { passkeys: [savedPasskey] } satisfies PasskeysView,
    }),
  );
  await page.route("**/api/mcp/connections", (route) =>
    route.fulfill({
      json: mcpConnectionsSchema.parse({ connections: [savedAgent] }),
    }),
  );
}

for (const locale of locales) {
  const t = dictionary(locale);
  for (const viewport of viewports) {
    test(`account settings layout and keyboard links: ${locale}, ${viewport.width}px`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await mockAccount(page, locale);
      await page.goto("/account/password");
      const main = page.locator("main");
      const settings = main.locator(".account-settings");
      const nav = settings.getByRole("navigation", {
        name: t("accountSecurity"),
        exact: true,
      });
      const links = nav.getByRole("link");
      const contextLabel = locale === "en" ? "Account settings" : "帳號設定";

      for (const [index, current] of accountPages.entries()) {
        await expect(settings).toHaveCount(1);
        await expect(settings).toHaveCSS("max-width", "720px");
        await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
        await expect(main.getByRole("heading", { level: 1 })).toHaveText(
          t(current.title),
        );
        await expect(
          settings.getByText(contextLabel, { exact: true }),
        ).toBeVisible();
        await expect(
          settings.getByRole("heading", { name: contextLabel, exact: true }),
        ).toHaveCount(0);
        await expect(nav).toHaveCount(1);
        await expect(links).toHaveText(
          accountPages.map(({ title }) => t(title)),
        );
        await expect(nav.locator("[aria-current]")).toHaveCount(1);
        await expect(links.nth(index)).toHaveAttribute("aria-current", "page");
        for (const [linkIndex, destination] of accountPages.entries()) {
          const link = links.nth(linkIndex);
          await expect(link).toHaveAttribute("href", destination.path);
          await expect(link).toHaveClass(/\baccount-settings-link\b/);
          await expect(link).not.toHaveAttribute("role");
          expect(
            await link.evaluate(
              (element) => element.getBoundingClientRect().height,
            ),
          ).toBeGreaterThanOrEqual(56);
        }
        if (current.title === "mcpConnections") {
          await expect(
            settings.getByRole("heading", {
              level: 2,
              name: savedAgent.clientName,
            }),
          ).toBeVisible();
        }
        for (const button of await settings.getByRole("button").all()) {
          expect(
            await button.evaluate(
              (element) => element.getBoundingClientRect().height,
            ),
          ).toBeGreaterThanOrEqual(44);
        }
        if (current.title === "changePassword") {
          const widths = await settings
            .getByRole("button", { name: t("changePassword"), exact: true })
            .evaluate((button) => {
              const form = button.closest("form");
              if (!form) throw new Error("Password form is missing");
              const style = getComputedStyle(form);
              return {
                button: button.getBoundingClientRect().width,
                content:
                  form.clientWidth -
                  Number.parseFloat(style.paddingLeft) -
                  Number.parseFloat(style.paddingRight),
              };
            });
          expect(Math.abs(widths.button - widths.content)).toBeLessThanOrEqual(
            1,
          );
        }
        await page.evaluate(() => document.fonts.ready);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(viewport.width);

        const nextIndex = (index + 1) % accountPages.length;
        await main.focus();
        for (let tab = 0; tab <= nextIndex; tab++)
          await page.keyboard.press("Tab");
        await expect(links.nth(nextIndex)).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(page).toHaveURL(
          new RegExp(`${accountPages[nextIndex].path}$`),
        );
        await expect(main).toBeFocused();
      }
    });

    test(`saved-agent revoke dialog contrast and cancellation focus: ${locale}, ${viewport.width}px`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await mockAccount(page, locale);
      let revocations = 0;
      await page.route(
        `**/api/mcp/connections/${savedAgent.id}/revoke`,
        (route) => {
          revocations++;
          expect(route.request().method()).toBe("POST");
          return route.fulfill({ json: { revoked: true } });
        },
      );
      await page.goto("/account/connections");
      const trigger = page.locator("main").getByRole("button", {
        name: t("mcpRevoke"),
        exact: true,
      });
      const dialog = page.getByRole("alertdialog");
      const cancel = dialog.getByRole("button", {
        name: t("cancel"),
        exact: true,
      });
      await trigger.focus();
      await page.keyboard.press("Enter");
      await expect(dialog).toHaveAccessibleName(t("mcpRevokeTitle"));
      await expect(dialog).toHaveAccessibleDescription(
        t("mcpRevokeDescription").replace("{client}", savedAgent.clientName),
      );
      await expect(cancel).toBeFocused();
      const audit = await new AxeBuilder({ page })
        .include('[role="alertdialog"]')
        .analyze();
      expect(audit.violations).toEqual([]);
      const cancelContrast = audit.passes
        .find(({ id }) => id === "color-contrast")
        ?.nodes.find(({ html }) => html.includes(`>${t("cancel")}<`))
        ?.any.find(({ id }) => id === "color-contrast")?.data;
      expect(cancelContrast?.contrastRatio).toBeGreaterThanOrEqual(4.5);
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(cancel).toBeFocused();
      await cancel.click();
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await expect(
        page.getByRole("heading", { level: 2, name: savedAgent.clientName }),
      ).toBeVisible();
      expect(revocations).toBe(0);
    });
  }

  test(`password labels, autocomplete, and local validation remain intact: ${locale}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await mockAccount(page, locale);
    let writes = 0;
    await page.route("**/api/actions/changePasswordAction", (route) => {
      writes++;
      return route.fulfill({ json: {} });
    });
    await page.goto("/account/password");
    const current = page.getByLabel(t("currentPassword"), { exact: true });
    const next = page.getByLabel(t("newPassword"), { exact: true });
    const confirm = page.getByLabel(t("confirmPassword"), { exact: true });
    for (const [field, autocomplete] of [
      [current, "current-password"],
      [next, "new-password"],
      [confirm, "new-password"],
    ] as const) {
      await expect(field).toHaveAttribute("autocomplete", autocomplete);
      await expect(field).toHaveAttribute("type", "password");
      await expect(field).toHaveAttribute("required", "");
      await expect(field).toHaveAttribute("maxlength", "256");
    }
    await expect(next).toHaveAttribute("minlength", "8");
    await expect(next).toHaveAccessibleDescription(t("passwordRequirements"));
    const submit = page.getByRole("button", {
      name: t("changePassword"),
      exact: true,
    });
    await current.fill("retained-current-password");
    await next.fill("short");
    await confirm.fill("short");
    await submit.click();
    await expect(next).toBeFocused();
    await expect(next).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("main").getByRole("alert")).toHaveText(
      t("passwordRequirements"),
    );
    expect(writes).toBe(0);
    await next.fill("a-valid-new-password");
    await confirm.fill("a-different-new-password");
    await submit.click();
    await expect(confirm).toBeFocused();
    await expect(confirm).toHaveAttribute("aria-invalid", "true");
    await expect(confirm).toHaveAccessibleDescription(t("passwordMismatch"));
    await expect(current).toHaveValue("retained-current-password");
    expect(writes).toBe(0);
  });

  test(`passkey removal restores focus to the password navigation link: ${locale}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await mockAccount(page, locale);
    let removed = false;
    let deletions = 0;
    await page.route("**/api/views/passkeys", (route) =>
      route.fulfill({ json: { passkeys: removed ? [] : [savedPasskey] } }),
    );
    await page.route("**/api/actions/deletePasskey", (route) => {
      deletions++;
      expect(route.request().method()).toBe("POST");
      expect(route.request().postDataJSON()).toEqual({ id: savedPasskey.id });
      removed = true;
      return route.fulfill({ json: {} });
    });
    await page.goto("/account/passkeys");
    const settings = page.locator("main .account-settings");
    const trigger = settings.getByRole("button", {
      name: `${t("delete")}: ${savedPasskey.name}`,
      exact: true,
    });
    await expect(
      settings.locator(".rt-Card").filter({
        has: page.getByText(savedPasskey.name, { exact: true }),
      }),
    ).toHaveCount(1);
    await trigger.click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: t("delete"), exact: true })
      .click();
    await expect(trigger).toHaveCount(0);
    await expect(
      settings.getByText(t("noPasskeys"), { exact: true }),
    ).toBeVisible();
    await expect(
      settings
        .getByRole("navigation", { name: t("accountSecurity"), exact: true })
        .getByRole("link", { name: t("changePassword"), exact: true }),
    ).toBeFocused();
    expect(deletions).toBe(1);
  });
}
