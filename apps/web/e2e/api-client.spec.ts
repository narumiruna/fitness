import { viewSchemas } from "@narumitw/fitness-contracts";
import { calculateStats } from "@narumitw/fitness-core/stats-calculations";
import { expect, test } from "@playwright/test";

const user = {
  id: "client-test-user",
  username: "client-test-user",
  role: "ADMIN",
};
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
  today: "2026-10-20",
  calendarWorkouts: [],
  planningTemplates: [],
  schedules: [],
};
const error = (code: string) => ({ error: { code, requestId: "client-test" } });

test.beforeEach(async ({ page }) => {
  await page.route("**/api/bootstrap", (route) =>
    route.fulfill({ json: { user, hasUsers: true, locale: "en" } }),
  );
  await page.route("**/api/views/workouts", (route) =>
    route.fulfill({ json: emptyWorkouts }),
  );
});

test("JavaScript-disabled navigation explains the SPA requirement", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    javaScriptEnabled: false,
  });
  try {
    const page = await context.newPage();
    await page.goto("/login");
    // Playwright's text matcher excludes noscript nodes even when scripts are disabled.
    await expect(page.locator("noscript")).toBeVisible();
    expect(await page.locator("noscript").textContent()).toContain(
      "Fitness requires JavaScript.",
    );
    await expect(page.getByLabel("Username", { exact: true })).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("same-page redirects keep focus and ignore malformed fragments", async ({
  page,
}) => {
  await page.route("**/api/views/workouts**", (route) =>
    route.fulfill({
      json: {
        ...emptyWorkouts,
        totalWorkoutCount: new URL(route.request().url()).searchParams.has(
          "created",
        )
          ? 1
          : 0,
      },
    }),
  );
  await page.goto("/workouts");
  const control = page.getByRole("link", { name: "New workout", exact: true });
  await control.focus();
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("fitness:navigate", {
        detail: "/workouts?created=confirmed",
      }),
    ),
  );
  await expect(
    page
      .locator(".stats-card")
      .filter({ hasText: "Total workouts" })
      .getByText("1", { exact: true }),
  ).toBeVisible();
  await expect(control).toBeFocused();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("fitness:navigate", {
        detail: "/workouts?created=confirmed#%E0",
      }),
    ),
  );
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(
    page.getByRole("heading", { name: "Workouts", exact: true }),
  ).toBeVisible();
  await expect(control).toBeFocused();
  expect(errors).toEqual([]);
});

test("calendar defaults use the server date instead of the browser clock", async ({
  page,
}) => {
  await page.clock.setSystemTime(new Date("2040-06-15T12:00:00.000Z"));
  await page.route("**/api/views/calendar", (route) =>
    route.fulfill({
      json: { today: "2030-01-01", workouts: [], schedules: [], sessions: [] },
    }),
  );
  await page.route("**/api/views/workouts", (route) =>
    route.fulfill({ json: { ...emptyWorkouts, today: "2030-01-01" } }),
  );
  await page.goto("/calendar");
  await expect(
    page.getByRole("heading", { name: "January 2030", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".calendar-day.today .calendar-day-number"),
  ).toHaveAttribute("aria-label", "2030-01-01");
  await page.goto("/workouts");
  await expect(page.locator(".mini-day.today")).toHaveAttribute(
    "aria-label",
    "2030-01-01",
  );
});

test.describe("server-local muscle report", () => {
  test.use({ timezoneId: "America/New_York" });

  test("the heading uses the API week when the browser is still on Saturday", async ({
    page,
  }) => {
    await page.clock.setSystemTime(new Date("2030-01-06T00:30:00.000Z"));
    const view = viewSchemas.stats.parse({
      today: "2030-01-06",
      stats: calculateStats([], "all", new Date(2030, 0, 6)),
      consistencyHistory: [],
      muscleSets: [],
    });
    await page.route("**/api/views/stats**", (route) =>
      route.fulfill({ json: view }),
    );
    await page.goto("/stats?year=2030");
    expect(
      await page.evaluate(() => {
        const now = new Date();
        return [
          now.getFullYear(),
          now.getMonth() + 1,
          now.getDate(),
          now.getDay(),
        ];
      }),
    ).toEqual([2030, 1, 5, 6]);
    const heading = page.getByRole("heading", {
      name: "Weekly working sets by muscle: 2030-01-06",
      exact: true,
    });
    await expect(heading).toBeVisible();
    const chest = heading
      .locator("..")
      .getByRole("row")
      .filter({ hasText: "Chest" });
    await expect(chest.getByRole("cell")).toHaveText(["Chest", "0", "0"]);
  });
});

test("malformed views fail closed and can be loaded again", async ({
  page,
}) => {
  let invalid = true;
  await page.route("**/api/views/workouts", (route) =>
    route.fulfill({
      json: invalid ? { workouts: "not-an-array" } : emptyWorkouts,
    }),
  );
  await page.goto("/workouts");
  await expect(page.getByRole("alert")).toHaveText(
    "This page could not be loaded.",
  );
  await expect(page.locator("article.workout-card")).toHaveCount(0);
  invalid = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.getByRole("heading", { name: "Workouts", exact: true }),
  ).toBeVisible();
});

test("403 and 404 remain separate from authentication expiry", async ({
  page,
}) => {
  await page.route("**/api/views/users", (route) =>
    route.fulfill({ status: 403, json: error("FORBIDDEN") }),
  );
  await page.route("**/api/views/workouts/missing", (route) =>
    route.fulfill({ status: 404, json: error("NOT_FOUND") }),
  );
  await page.goto("/admin/users");
  await expect(page.getByRole("alert")).toHaveText(
    "You do not have access to this page.",
  );
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await page.goto("/workouts/missing");
  await expect(page.getByRole("alert")).toHaveText(
    "This page or record was not found.",
  );
});

test("401 removes private data and returns to sign-in", async ({ page }) => {
  let authenticated = true;
  await page.route("**/api/bootstrap", (route) =>
    route.fulfill({
      json: { user: authenticated ? user : null, hasUsers: true, locale: "en" },
    }),
  );
  await page.route("**/api/views/measurements", (route) => {
    authenticated = false;
    return route.fulfill({
      status: 401,
      json: error("AUTHENTICATION_REQUIRED"),
    });
  });
  await page.goto("/workouts");
  await page.getByRole("link", { name: "Measurements", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("Username", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
});

test("logout cancels private in-flight reads before the next account", async ({
  page,
}) => {
  let authenticated = true;
  let release: () => void = () => {};
  let observed: () => void = () => {};
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    observed = resolve;
  });
  await page.route("**/api/bootstrap", (route) =>
    route.fulfill({
      json: { user: authenticated ? user : null, hasUsers: true, locale: "en" },
    }),
  );
  await page.route("**/api/views/measurements", async (route) => {
    observed();
    await delayed;
    try {
      await route.fulfill({
        json: {
          today: "2026-10-20",
          records: [
            {
              id: "private-record",
              date: "2026-10-20",
              weight: 77.7,
              waist: null,
              updatedAt: "2026-10-20T10:00:00.000Z",
            },
          ],
          goal: null,
        },
      });
    } catch {
      /* The account switch can cancel this request before fulfillment. */
    }
  });
  await page.route("**/api/actions/logoutAction", (route) => {
    authenticated = false;
    return route.fulfill({ json: { redirect: "/login" } });
  });
  await page.goto("/workouts");
  await page.getByRole("link", { name: "Measurements", exact: true }).click();
  await started;
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  release();
  await expect(page.getByLabel("Username", { exact: true })).toBeVisible();
  await expect(page.locator("main")).not.toContainText("77.7");
  await page.goBack();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator("main")).not.toContainText("77.7");
});

test("mutations are not retried and network failure keeps the draft and request key", async ({
  page,
}) => {
  const key = "11111111-1111-4111-8111-111111111111";
  await page.route("**/api/views/workouts/new", (route) =>
    route.fulfill({ json: { initialDate: "2026-10-20", key } }),
  );
  let requests = 0;
  await page.route("**/api/actions/createWorkoutAction", (route) => {
    requests++;
    return requests === 1
      ? route.abort("failed")
      : route.fulfill({ json: { result: { error: "invalidWorkoutInput" } } });
  });
  await page.goto("/workouts/new");
  await page.getByLabel("Title", { exact: true }).fill("Retained draft");
  await page
    .getByRole("button", { name: "Create workout", exact: true })
    .click();
  await expect(page.locator("main").getByRole("status")).toContainText(
    "Not saved.",
  );
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Retained draft",
  );
  await expect(page.locator('input[name="key"]')).toHaveValue(key);
  expect(requests).toBe(1);
  await page
    .getByRole("button", { name: "Create workout", exact: true })
    .click();
  await expect(page.locator("main").getByRole("status")).toContainText(
    "Enter a valid date",
  );
  expect(requests).toBe(2);
});
