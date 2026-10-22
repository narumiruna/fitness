import { expect, test } from "@playwright/test";
import { createParticipantFixture } from "../../../tests/fixtures/ui-ux-participant";

// Excluded from the default *.spec.ts suite. Run with the participant config.
// This opens a fixture for observation; it does not grade human comprehension.
test("disposable participant session", async ({ page }) => {
  test.setTimeout(16 * 60_000);
  const fixture = await createParticipantFixture();
  try {
    await page.goto("/login");
    await page.locator('input[name="username"]').fill(fixture.username);
    await page.locator('input[name="password"]').fill(fixture.password);
    await page.locator('form button[type="submit"]').first().click();
    await expect(page).toHaveURL(/\/workouts$/);
    await expect(page.locator("h1")).toBeVisible();
    // The observer and participant use this browser for up to 15 minutes.
    // Ctrl+C stops the owning runner and its processes; do not reuse the server.
    await page.waitForTimeout(15 * 60_000);
  } finally {
    await fixture.cleanup();
  }
});
