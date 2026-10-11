import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { prisma } from "../src/lib/prisma";

let adminPassword = "admin";
let workoutPath = "";
let exercisePath = "";
const browserErrors: string[] = [];

test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (
      /hydration|unique.*key|invalid.*nest|cannot.*descendant/i.test(
        message.text(),
      )
    ) {
      browserErrors.push(message.text());
    }
  });
});
test.afterEach(() => expect(browserErrors).toEqual([]));
test.afterAll(async () => prisma.$disconnect());

async function login(page: Page, username = "admin", password = adminPassword) {
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/workouts$/);
}

async function choose(page: Page, trigger: Locator, label: string) {
  await trigger.click();
  await page.getByRole("option", { name: label, exact: true }).click();
  await expect(trigger).toContainText(label);
}

function formWith(page: Page, button: string) {
  return page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: button, exact: true }) });
}

async function formData(form: Locator) {
  return form.evaluate((element) =>
    Object.fromEntries(new FormData(element as HTMLFormElement)),
  );
}

async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

test("setup, login failures, password validation, and session replacement", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/setup$/);
  await page.getByRole("button", { name: "Create admin" }).click();
  await expect(page).toHaveURL(/\/setup$/);
  expect(await prisma.user.count()).toBe(0);
  await page.getByLabel("Username").fill("admin");
  await page.getByLabel("Password", { exact: true }).fill("admin");
  await page.getByRole("button", { name: "Create admin" }).click();
  await expect(page).toHaveURL(/\/workouts$/);
  await expect(
    page.getByText("No workouts yet.", { exact: true }),
  ).toBeVisible();
  await page.goto("/stats");
  await expect(
    page.getByText("Log workouts and sets to see stats."),
  ).toBeVisible();
  await page.goto("/calendar");
  await expect(page.getByText("No workouts this month.")).toBeVisible();
  await page.goto("/workouts");
  await formWith(page, "Create workout")
    .getByRole("button", { name: "Create workout" })
    .click();
  await expect(page).toHaveURL(/\/workouts\/[^/?]+$/);
  const emptySelectForm = formWith(page, "Add set");
  await emptySelectForm.getByLabel("Weight", { exact: true }).fill("10");
  await emptySelectForm.getByLabel("Reps", { exact: true }).fill("2");
  expect((await formData(emptySelectForm)).exerciseId).toBe("");
  expect(
    await emptySelectForm.evaluate((el) =>
      (el as HTMLFormElement).checkValidity(),
    ),
  ).toBe(false);
  await emptySelectForm
    .getByRole("button", { name: "Add set", exact: true })
    .click();
  expect(await prisma.workoutSet.count()).toBe(0);
  await page
    .locator(".page-header")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(page).toHaveURL(/\/workouts$/);
  await page.goto("/setup");
  await expect(page).toHaveURL(/\/workouts$/);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("Username")).toHaveValue("");
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "autocomplete",
    "current-password",
  );
  await page.getByLabel("Username").fill("admin");
  await page.getByLabel("Password", { exact: true }).fill("wrong");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText(
    "Invalid username or password.",
  );
  await login(page);
  const oldSession = (await context.cookies()).find(
    (cookie) => cookie.name === "fitness_session",
  );
  expect(oldSession?.httpOnly).toBe(true);
  await page.goto("/account/password");
  await page.getByLabel("Current password").fill("wrong");
  await page.getByLabel("New password").fill("admin-new-password");
  await page.getByLabel("Confirm password").fill("admin-new-password");
  await page
    .getByRole("button", { name: "Change password", exact: true })
    .click();
  await expect(page).toHaveURL(/error=current/);
  await expect(page.locator("main").getByRole("alert")).toBeVisible();
  await page.getByLabel("Current password").fill("admin");
  await page.getByLabel("New password").fill("short");
  await page.getByLabel("Confirm password").fill("short");
  expect(
    await page
      .getByLabel("New password")
      .evaluate((el) => (el as HTMLInputElement).checkValidity()),
  ).toBe(false);
  await page.getByLabel("New password").fill("admin-new-password");
  await page.getByLabel("Confirm password").fill("mismatch-password");
  await page
    .getByRole("button", { name: "Change password", exact: true })
    .click();
  await expect(page).toHaveURL(/error=invalid/);
  await expect(page.locator("main").getByRole("alert")).toBeVisible();
  await page.getByLabel("Current password").fill("admin");
  await page.getByLabel("New password").fill("admin-new-password");
  await page.getByLabel("Confirm password").fill("admin-new-password");
  await page
    .getByRole("button", { name: "Change password", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Password changed.");
  adminPassword = "admin-new-password";
  const newSession = (await context.cookies()).find(
    (cookie) => cookie.name === "fitness_session",
  );
  expect(newSession?.value).not.toBe(oldSession?.value);
  expect(await prisma.session.count()).toBe(1);
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.goto("/workouts");
  await expect(page).toHaveURL(/\/login$/);
  await login(page);
});

test("exercise aliases, all workout forms, filters, templates, and statistics", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.goto("/exercises");
  await expect(page.getByText("No exercises match this search.")).toBeVisible();
  await page.getByLabel("Default name").fill("Bench Press");
  await page
    .getByRole("button", { name: "Create exercise", exact: true })
    .click();
  await expect(page).toHaveURL(/created=/);
  await page.getByLabel("Default name").fill("Squat");
  await page
    .getByRole("button", { name: "Create exercise", exact: true })
    .click();
  await expect(page.locator(".exercise-row")).toHaveCount(2);
  await expect(
    page.getByRole("heading", { name: "Squat", exact: true }),
  ).toBeVisible();
  const benchRow = page.locator(".exercise-row").filter({
    has: page.getByRole("heading", { name: "Bench Press", exact: true }),
  });
  const disclosure = benchRow.locator("button[aria-expanded]");
  await disclosure.focus();
  await page.keyboard.press("Enter");
  await expect(disclosure).toHaveAttribute("aria-expanded", "true");
  await benchRow.getByLabel("Locale").fill("en");
  await benchRow.getByLabel("Alias", { exact: true }).fill("Chest press");
  await benchRow
    .locator("form")
    .getByRole("button", { name: "Add alias" })
    .click();
  await expect(
    benchRow.getByText("Chest press", { exact: false }),
  ).toBeVisible();
  exercisePath =
    (await benchRow
      .getByRole("link", { name: "History" })
      .getAttribute("href")) ?? "";
  await page.getByLabel("Search", { exact: true }).fill("Chest press");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".exercise-row")).toHaveCount(1);
  await page.getByRole("link", { name: "Clear", exact: true }).click();
  await expect(page.locator(".exercise-row")).toHaveCount(2);
  await expect(page.getByLabel("Search", { exact: true })).toHaveValue("");
  await page.goto(exercisePath);
  await expect(
    page.getByText("No history for this exercise yet."),
  ).toBeVisible();

  await page.goto("/workouts");
  const create = formWith(page, "Create workout");
  await create.getByLabel("Date", { exact: true }).fill("");
  expect(
    await create.evaluate((el) => (el as HTMLFormElement).checkValidity()),
  ).toBe(false);
  await create
    .getByLabel("Date", { exact: true })
    .fill(new Date().toLocaleDateString("en-CA"));
  await create.getByLabel("Title", { exact: true }).fill("UI workout");
  await create.getByLabel("Notes", { exact: true }).fill("UI notes");
  const date = await create.getByLabel("Date", { exact: true }).inputValue();
  await expect(create.getByLabel("Date", { exact: true })).toHaveAttribute(
    "type",
    "date",
  );
  await create.getByRole("button", { name: "Create workout" }).click();
  await expect(page).toHaveURL(/\/workouts\/[^/?]+$/);
  workoutPath = new URL(page.url()).pathname;
  const workoutId = workoutPath.split("/").at(-1) ?? "";
  const edit = formWith(page, "Update workout");
  await edit.getByLabel("Title", { exact: true }).fill("UI workout edited");
  await edit.getByRole("button", { name: "Update workout" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "UI workout edited",
  );
  const add = formWith(page, "Add set");
  const exercise = add.getByRole("combobox", { name: "Exercise", exact: true });
  await expect(exercise).toHaveText("Bench Press");
  await exercise.focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("listbox")).toBeVisible();
  expect(
    await page
      .getByRole("listbox")
      .evaluate((el) =>
        getComputedStyle(el).getPropertyValue("--accent-9").trim(),
      ),
  ).not.toBe("");
  await page.keyboard.press("Escape");
  await expect(exercise).toBeFocused();
  await add.getByLabel("Weight", { exact: true }).fill("50.25");
  expect(
    await add
      .getByLabel("Weight", { exact: true })
      .evaluate((el) => (el as HTMLInputElement).validity.stepMismatch),
  ).toBe(true);
  await add.getByLabel("Weight", { exact: true }).fill("50");
  await add.getByLabel("Reps", { exact: true }).fill("5");
  await add.getByLabel("Notes", { exact: true }).fill("First set");
  await add.getByRole("button", { name: "Add set", exact: true }).click();
  await expect(page.locator(".desktop-table tbody tr")).toHaveCount(1);
  await add.getByLabel("Weight", { exact: true }).fill("60");
  await add.getByLabel("Reps", { exact: true }).fill("3");
  await add.getByRole("button", { name: "Add set", exact: true }).click();
  await expect(page.locator(".desktop-table tbody tr")).toHaveCount(2);
  const rows = page.locator(".desktop-table tbody tr");
  const first = rows.first();
  await choose(page, first.getByRole("combobox"), "Squat");
  await first.locator('input[name="weight"]').fill("70");
  await first.locator('input[name="reps"]').fill("4");
  await first.locator('input[name="notes"]').fill("Desktop edit");
  const firstForm = first.locator("form[id]");
  const submitted = await formData(firstForm);
  expect(submitted).toMatchObject({
    workoutId,
    weight: "70",
    reps: "4",
    notes: "Desktop edit",
  });
  const firstId = String(submitted.setId);
  await first.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await prisma.workoutSet.findUniqueOrThrow({ where: { id: firstId } }))
          .weight,
    )
    .toBe(70);
  expect(
    (
      await prisma.workoutSet.findMany({
        where: { workoutId },
        orderBy: { order: "asc" },
      })
    )[1]?.weight,
  ).toBe(60);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = page.locator(".mobile-list article").first();
  await expect(mobile.getByLabel("Weight", { exact: true })).toHaveValue("70");
  await mobile.getByLabel("Weight", { exact: true }).fill("75");
  await mobile.getByLabel("Notes", { exact: true }).fill("Mobile edit");
  await mobile.getByRole("button", { name: "Update set", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await prisma.workoutSet.findUniqueOrThrow({ where: { id: firstId } }))
          .weight,
    )
    .toBe(75);
  await page
    .locator(".mobile-list article")
    .last()
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(page.locator(".mobile-list article")).toHaveCount(1);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(first.locator('input[name="weight"]')).toHaveValue("75");
  const template = formWith(page, "Save as template");
  await template.getByLabel("Template name").fill("UI template");
  await template.getByRole("button", { name: "Save as template" }).click();
  await expect.poll(() => prisma.workoutTemplate.count()).toBe(1);
  await page.getByRole("button", { name: "Repeat", exact: true }).click();
  await expect(page).not.toHaveURL(new RegExp(`${workoutId}$`));
  await expect(page.locator(".desktop-table tbody tr")).toHaveCount(1);
  await page
    .locator(".page-header")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(page).toHaveURL(/\/workouts$/);
  const templateItem = page.locator(".template-item");
  await templateItem
    .getByRole("button", { name: "Create from template" })
    .click();
  await expect(page).toHaveURL(/\/workouts\/[^/?]+$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "UI template",
  );
  await page
    .locator(".desktop-table tbody tr")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(page.getByText("No sets yet.", { exact: true })).toBeVisible();
  await page
    .locator(".page-header")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(page).toHaveURL(/\/workouts$/);
  await page
    .locator(".template-item")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(
    page.getByText("No templates yet.", { exact: false }),
  ).toBeVisible();

  const admin = await prisma.user.findUniqueOrThrow({
    where: { username: "admin" },
  });
  await prisma.workout.createMany({
    data: Array.from({ length: 22 }, (_, index) => ({
      userId: admin.id,
      title: `Fixture ${index}`,
      date: new Date(`${date.slice(0, 7)}-01T00:00:00`),
    })),
  });
  await page.goto("/workouts");
  await expect(page.locator(".workout-card")).toHaveCount(20);
  await expect(
    page.getByRole("button", { name: "Previous", exact: true }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "Next", exact: true }).click();
  await expect(page.locator(".workout-card")).toHaveCount(3);
  await page.getByRole("link", { name: "Previous", exact: true }).click();
  const filters = formWith(page, "Apply filters");
  await expect(filters.getByRole("combobox")).toHaveText("All exercises");
  expect((await formData(filters)).exercise).toBe("");
  expect((await formData(filters)).notes).toBeUndefined();
  await filters.getByLabel("Month", { exact: true }).fill(date.slice(0, 7));
  await filters.getByLabel("Search", { exact: true }).fill("UI workout");
  await filters.getByRole("checkbox").check();
  expect((await formData(filters)).notes).toBe("1");
  await choose(page, filters.getByRole("combobox"), "Squat");
  await filters.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.locator(".workout-card")).toHaveCount(1);
  await expect(filters.getByRole("combobox")).toHaveText("Squat");
  await choose(page, filters.getByRole("combobox"), "All exercises");
  await filters.getByRole("checkbox").uncheck();
  await filters.getByRole("button", { name: "Apply filters" }).click();
  expect(new URL(page.url()).searchParams.get("exercise")).toBe("");
  expect(new URL(page.url()).searchParams.has("notes")).toBe(false);
  await page.getByRole("link", { name: "Clear filters" }).click();
  await expect(filters.getByRole("combobox")).toHaveText("All exercises");
  await expect(filters.getByLabel("Search", { exact: true })).toHaveValue("");
  await expect(filters.getByLabel("Month", { exact: true })).toHaveValue("");
  await expect(filters.getByRole("checkbox")).not.toBeChecked();
  await page.goto(
    "/workouts?q=no-match&month=invalid&page=-1&exercise=invalid",
  );
  await expect(
    page.getByText("No workouts yet.", { exact: true }),
  ).toBeVisible();
  await page.goto("/stats");
  await expect(
    page.locator(".stats-card").filter({ hasText: "Total volume" }),
  ).toContainText("300");
  await expect(
    page.locator(".stats-card").filter({ hasText: "Total reps" }),
  ).toContainText("4");
  expect(
    await page
      .locator(".stats-bar-fill")
      .evaluateAll((els) =>
        els.some(
          (el) =>
            (el as HTMLElement).style.getPropertyValue("--bar-width") ===
            "100%",
        ),
      ),
  ).toBe(true);
  const squat = await prisma.exercise.findUniqueOrThrow({
    where: { slug: "squat" },
  });
  exercisePath = `/exercises/${squat.id}`;
  await page.goto(exercisePath);
  await expect(
    page.locator(".stats-card").filter({ hasText: "Total volume" }),
  ).toContainText("300");
  await page.goto("/calendar");
  await expect(page.locator(".calendar-more").first()).toContainText("more");
  expect(
    await page.locator(".calendar-day.outside-month").count(),
  ).toBeGreaterThan(0);
  await expect(page.locator(".calendar-day.today")).toHaveCount(1);
  await page.getByRole("link", { name: "Previous", exact: true }).click();
  await expect(page).toHaveURL(/year=.*month=/);
  const previousUrl = page.url();
  await page.getByRole("link", { name: "Next", exact: true }).click();
  await expect(page).not.toHaveURL(previousUrl);
  await page.getByRole("link", { name: "Today", exact: true }).click();
  await expect(page).toHaveURL(/\/calendar$/);
  const calendarWorkout = page
    .locator(".calendar-workout")
    .filter({ hasText: "UI workout edited" });
  await expect(calendarWorkout).toHaveAttribute("href", workoutPath);
  await calendarWorkout.click();
  await expect(page).toHaveURL(new RegExp(`${workoutId}$`));
  await page.goto("/calendar?year=invalid&month=99");
  await expect(page.locator(".calendar-day.today")).toHaveCount(1);
  await page.goto("/workouts/not-found");
  await expect(page.getByText("This page could not be found.")).toBeVisible();
});

test("admin roles and user data isolation", async ({ page }) => {
  await login(page);
  await page.goto("/admin/users");
  const create = formWith(page, "Create user");
  await create.getByLabel("Username").fill("member");
  await create.getByLabel("Password", { exact: true }).fill("member-password");
  expect((await formData(create)).role).toBe("USER");
  await create.getByRole("button", { name: "Create user" }).click();
  await expect(
    page.getByRole("cell", { name: "member", exact: true }),
  ).toBeVisible();
  await create.getByLabel("Username").fill("second-admin");
  await create.getByLabel("Password", { exact: true }).fill("admin-password");
  await choose(page, create.getByRole("combobox"), "ADMIN");
  await create.getByRole("button", { name: "Create user" }).click();
  await expect(
    page.getByRole("cell", { name: "second-admin", exact: true }),
  ).toBeVisible();
  expect(
    (
      await prisma.user.findUniqueOrThrow({
        where: { username: "second-admin" },
      })
    ).role,
  ).toBe("ADMIN");
  await expect(create.getByRole("combobox")).toHaveText("USER");
  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, "member", "member-password");
  await expect(
    page.getByRole("link", { name: "Admin", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".workout-card")).toHaveCount(0);
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/workouts$/);
  await page.goto(workoutPath);
  await expect(page.getByText("This page could not be found.")).toBeVisible();
  await page.goto(exercisePath);
  await expect(
    page.getByText("No history for this exercise yet."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
});

test("responsive routes, semantic controls, CSS states, and themed portals", async ({
  page,
}, info) => {
  await login(page);
  const routes = [
    "/workouts",
    workoutPath,
    "/exercises",
    exercisePath,
    "/stats",
    "/calendar",
    "/admin/users",
    "/account/password",
    "/source",
  ];
  for (const route of routes) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    expect(
      await page.locator(".radix-themes").getAttribute("data-accent-color"),
    ).toBe("teal");
    for (const width of [320, 390, 720, 721, 960, 961, 1023, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await noOverflow(page);
      expect(
        await page.evaluate(() => {
          const ids = Array.from(document.querySelectorAll("[id]")).map(
            (el) => el.id,
          );
          return ids.length === new Set(ids).size;
        }),
      ).toBe(true);
    }
    for (const [name, width] of [
      ["desktop", 1440],
      ["mobile", 390],
    ] as const) {
      await page.setViewportSize({ width, height: 1000 });
      const accessibility = await new AxeBuilder({ page })
        .exclude("nextjs-portal")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(accessibility.violations, `${route} at ${width}px`).toEqual([]);
      await page.screenshot({
        path: info.outputPath(`${route.replaceAll("/", "-")}-${name}.png`),
        fullPage: true,
      });
    }
  }
  await page.goto(workoutPath);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const first = page.locator(".desktop-table tbody tr").first();
  await expect(first.locator('input[name="weight"]')).toHaveAttribute(
    "min",
    "0",
  );
  await expect(first.locator('input[name="weight"]')).toHaveAttribute(
    "step",
    "0.5",
  );
  await expect(first.locator('input[name="weight"]')).toHaveAttribute(
    "required",
    "",
  );
  await expect(first.locator('input[name="reps"]')).toHaveAttribute("min", "1");
  const trigger = first.getByRole("combobox");
  await trigger.focus();
  await expect(trigger).toBeFocused();
  expect(
    await trigger.evaluate((el) => getComputedStyle(el).boxShadow),
  ).not.toBe("none");
  await trigger.click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await page.goto("/source");
  await expect(page.getByText(/licensed under AGPL-3.0-only/)).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await noOverflow(page);
    await page.screenshot({
      path: info.outputPath(`login-${width}.png`),
      fullPage: true,
    });
  }
});
