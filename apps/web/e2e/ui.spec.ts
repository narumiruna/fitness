import AxeBuilder from "@axe-core/playwright";
import { formatDateKey } from "@narumitw/fitness-core/calendar";
import { expect, type Locator, type Page, test } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma } from "../../api/src/lib/prisma";
import { dictionary } from "../src/lib/translations";

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

async function openDisclosure(page: Page, label: string) {
  const summary = page
    .locator("details > summary")
    .filter({ hasText: new RegExp(`^${label}$`) });
  if (!(await summary.locator("..").evaluate((el) => el.hasAttribute("open"))))
    await summary.click();
}

async function formData(form: Locator) {
  return form.evaluate((element) =>
    Object.fromEntries(new FormData(element as HTMLFormElement)),
  );
}

async function captureDashboard(
  page: Page,
  info: { outputPath: (name: string) => string },
  state: string,
) {
  for (const route of ["/workouts", "/calendar", "/stats", "/exercises"]) {
    await page.goto(route);
    await expect(
      page.locator(".primary-nav [aria-current=page]"),
    ).toHaveAttribute("href", route);
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await noOverflow(page);
      const result = await new AxeBuilder({ page })

        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(result.violations, `${state} ${route} ${width}`).toEqual([]);
      await page.screenshot({
        caret: "initial",
        path: info.outputPath(`${state}-${route.slice(1)}-${width}.png`),
        fullPage: true,
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
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
}, info) => {
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
  await captureDashboard(page, info, "empty");
  await page.goto("/stats");
  await expect(
    page.getByText("Log workouts and sets to see stats."),
  ).toBeVisible();
  await page.goto("/calendar");
  await expect(page.getByText("No workouts this month.")).toBeVisible();
  await page.goto("/workouts/new");
  await formWith(page, "Create workout")
    .getByRole("button", { name: "Create workout" })
    .click();
  await expect(page).toHaveURL(/\/workouts\/(?!new$)[^/?]+$/);
  const emptySelectForm = formWith(page, "Add set");
  await emptySelectForm.getByLabel("Weight (kg)", { exact: true }).fill("10");
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
    .locator(".workout-page > .card-actions")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
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
  await expect(page.getByLabel("Confirm password")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.locator("main").getByRole("alert")).toContainText("match");
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
  await expect(page).toHaveURL(/\/login$/);
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
  await expect(page.getByText("Your exercise library is empty.")).toBeVisible();
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
  const disclosure = benchRow.locator(".inline-disclosure > summary");
  await disclosure.focus();
  await page.keyboard.press("Enter");
  await expect(benchRow.locator(".inline-disclosure")).toHaveAttribute(
    "open",
    "",
  );
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
  await page.getByRole("link", { name: "Clear filters", exact: true }).click();
  await expect(page.locator(".exercise-row")).toHaveCount(2);
  await expect(page.getByLabel("Search", { exact: true })).toHaveValue("");
  await page.goto(exercisePath);
  await expect(
    page.getByText("No history for this exercise yet."),
  ).toBeVisible();

  await page.goto("/workouts/new");
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
  await expect(page).toHaveURL(/\/workouts\/(?!new$)[^/?]+$/);
  workoutPath = new URL(page.url()).pathname;
  const workoutId = workoutPath.split("/").at(-1) ?? "";
  await openDisclosure(page, "Edit workout");
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
  await add.getByLabel("Weight (kg)", { exact: true }).fill("50.25");
  expect(
    await add
      .getByLabel("Weight (kg)", { exact: true })
      .evaluate((el) => (el as HTMLInputElement).validity.stepMismatch),
  ).toBe(false);
  await add.getByLabel("Weight (kg)", { exact: true }).fill("50.0001");
  expect(
    await add
      .getByLabel("Weight (kg)", { exact: true })
      .evaluate((el) => (el as HTMLInputElement).validity.stepMismatch),
  ).toBe(true);
  await add.getByLabel("Weight (kg)", { exact: true }).fill("50");
  await add.getByLabel("Reps", { exact: true }).fill("5");
  await add.getByLabel("Notes", { exact: true }).fill("First set");
  await add.getByRole("button", { name: "Add set", exact: true }).click();
  await expect(page.locator("article.recorded-set")).toHaveCount(1);
  await add.getByLabel("Weight (kg)", { exact: true }).fill("60");
  await add.getByLabel("Reps", { exact: true }).fill("3");
  await add.getByRole("button", { name: "Add set", exact: true }).click();
  await expect(page.locator("article.recorded-set")).toHaveCount(2);
  const rows = page.locator("article.recorded-set");
  const first = rows.first();
  await first.locator("summary").click();
  await choose(
    page,
    first.getByRole("combobox", { name: "Exercise", exact: true }),
    "Squat",
  );
  await first.locator('input[name="weight"]').fill("70");
  await first.locator('input[name="reps"]').fill("4");
  await first.locator('textarea[name="notes"]').fill("Desktop edit");
  const firstForm = first.locator("form");
  const submitted = await formData(firstForm);
  expect(submitted).toMatchObject({
    workoutId,
    weight: "70",
    reps: "4",
    notes: "Desktop edit",
  });
  const firstId = String(submitted.setId);
  await first.getByRole("button", { name: "Update set", exact: true }).click();
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

  await expect(first.locator(".set-result")).toContainText("70 kg × 4");
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = page.locator("article.recorded-set").first();
  await mobile.locator("details > summary").click();
  await expect(mobile.getByLabel("Weight (kg)", { exact: true })).toHaveValue(
    "70",
  );
  await mobile.getByLabel("Weight (kg)", { exact: true }).fill("75");
  await mobile.getByLabel("Notes", { exact: true }).fill("Mobile edit");
  await mobile.getByRole("button", { name: "Update set", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await prisma.workoutSet.findUniqueOrThrow({ where: { id: firstId } }))
          .weight,
    )
    .toBe(75);
  await expect(mobile.locator(".set-result")).toContainText("75 kg × 4");
  await page
    .locator("article.recorded-set")
    .last()
    .locator("details > summary")
    .click();
  await page
    .locator("article.recorded-set")
    .last()
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(page.locator("article.recorded-set")).toHaveCount(1);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await first.locator("summary").click();
  await expect(first.locator('input[name="weight"]')).toHaveValue("75");
  await openDisclosure(page, "Save as template");
  const template = formWith(page, "Save as template");
  await template.getByLabel("Template name").fill("UI template");
  await template.getByRole("button", { name: "Save as template" }).click();
  await expect.poll(() => prisma.workoutTemplate.count()).toBe(1);
  await page.getByRole("button", { name: "Repeat", exact: true }).click();
  await expect(page).not.toHaveURL(new RegExp(`${workoutId}$`));
  await expect(page.locator("article.recorded-set")).toHaveCount(1);
  await page
    .locator(".workout-page > .card-actions")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(page).toHaveURL(/\/workouts$/);
  const templateItem = page.locator(".template-item");
  await templateItem.locator("summary").click();
  await templateItem
    .getByRole("button", { name: "Create from template" })
    .click();
  await expect(page).toHaveURL(/\/workouts\/[^/?]+$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "UI template",
  );
  await page.locator("article.recorded-set summary").click();
  await page
    .locator("article.recorded-set")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(page.getByText("No sets yet.", { exact: true })).toBeVisible();
  await page
    .locator(".workout-page > .card-actions")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(page).toHaveURL(/\/workouts$/);
  await page
    .locator(".template-item")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
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
  await expect(page.locator(".workout-card")).toHaveCount(20);
  await openDisclosure(page, "Filter workouts");
  const filters = formWith(page, "Apply filters");
  await expect(filters.getByRole("combobox")).toHaveText("All exercises");
  expect((await formData(filters)).exercise).toBe("");
  expect((await formData(filters)).notes).toBeUndefined();
  await filters.getByLabel("Month", { exact: true }).fill(date.slice(0, 7));
  await filters.getByLabel("Search", { exact: true }).fill("UI workout");
  for (let attempt = 0; attempt < 5; attempt++) {
    await filters.getByRole("checkbox").check();
    await expect.poll(async () => (await formData(filters)).notes).toBe("1");
    await filters.getByRole("checkbox").uncheck();
    await expect
      .poll(async () => (await formData(filters)).notes)
      .toBeUndefined();
  }
  await filters.getByRole("checkbox").check();
  await expect.poll(async () => (await formData(filters)).notes).toBe("1");
  await choose(page, filters.getByRole("combobox"), "Squat");
  await filters.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.locator(".workout-card")).toHaveCount(1);
  await openDisclosure(page, "Filter workouts");
  await expect(filters.getByRole("combobox")).toHaveText("Squat");
  await choose(page, filters.getByRole("combobox"), "All exercises");
  await filters.getByRole("checkbox").uncheck();
  await filters.getByRole("button", { name: "Apply filters" }).click();
  expect(new URL(page.url()).searchParams.get("exercise")).toBe("");
  expect(new URL(page.url()).searchParams.has("notes")).toBe(false);
  await page.getByRole("link", { name: "Clear filters" }).click();
  await openDisclosure(page, "Filter workouts");
  await expect(filters.getByRole("combobox")).toHaveText("All exercises");
  await expect(filters.getByLabel("Search", { exact: true })).toHaveValue("");
  await expect(filters.getByLabel("Month", { exact: true })).toHaveValue("");
  await expect(filters.getByRole("checkbox")).not.toBeChecked();
  await page.goto(
    "/workouts?q=no-match&month=invalid&page=-1&exercise=invalid",
  );
  await expect(
    page.getByText("No workouts match these filters.", { exact: true }),
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
  await page.getByRole("link", { name: "Previous month", exact: true }).click();
  await expect(page).toHaveURL(/year=.*month=/);
  const previousUrl = page.url();
  await page.getByRole("link", { name: "Next month", exact: true }).click();
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
  await expect(page.getByRole("alert")).toHaveText(
    "This page or record was not found.",
  );
});

test("admin roles and user data isolation", async ({ page }) => {
  await login(page);
  await page.goto("/admin/users");
  await openDisclosure(page, "Create user");
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
  await choose(page, create.getByRole("combobox"), "Administrator");
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
  await expect(create.getByRole("combobox")).toHaveText("Member");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await login(page, "member", "member-password");
  await expect(
    page.getByRole("link", { name: "Admin", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".workout-card")).toHaveCount(0);
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/workouts$/);
  await page.goto(workoutPath);
  await expect(page.getByRole("alert")).toHaveText(
    "This page or record was not found.",
  );
  await page.goto(exercisePath);
  await expect(
    page.getByText("No history for this exercise yet."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
});

test("dashboard ranges, calendar selection, private usage, confirmations, and visual review", async ({
  page,
}, info) => {
  const user = await prisma.user.create({
    data: {
      username: "reviewer",
      passwordHash: await bcrypt.hash("review-password", 12),
    },
  });
  const names = [
    "Bench Press",
    "Squat",
    "Deadlift",
    "Overhead Press",
    "Pull Up",
    "Romanian Deadlift",
    "Leg Press",
    "Plank",
  ];
  const exercises: { id: string }[] = [];
  for (const name of names) {
    const slug = name.toLowerCase().replaceAll(" ", "-");
    exercises.push(
      await prisma.exercise.upsert({
        where: { slug },
        update: {},
        create: { slug, defaultName: name },
      }),
    );
  }
  const now = new Date();
  const day = (offset: number) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  for (let i = 0; i < 18; i++) {
    await prisma.workout.create({
      data: {
        userId: user.id,
        date: day(-i * 4),
        title:
          i % 3 === 0 ? "Lower body" : i % 3 === 1 ? "Upper body" : "Full body",
        notes:
          i % 4 === 0
            ? "Strong session. Kept the repetitions controlled."
            : undefined,
        sets: {
          create: Array.from({ length: 6 }, (_, j) => ({
            exerciseId: exercises[(i + j) % exercises.length].id,
            weight: 20 + i * 2 + j * 5,
            reps: 6 + j,
            order: j + 1,
          })),
        },
      },
    });
  }
  await prisma.workout.create({
    data: {
      userId: user.id,
      date: day(0),
      title: "Evening session",
      sets: {
        create: { exerciseId: exercises[0].id, weight: 40, reps: 5, order: 1 },
      },
    },
  });
  const old = await prisma.workout.create({
    data: {
      userId: user.id,
      date: day(-200),
      title: "Older record",
      sets: {
        create: { exerciseId: exercises[0].id, weight: 500, reps: 1, order: 1 },
      },
    },
  });
  await prisma.workoutTemplate.create({
    data: {
      userId: user.id,
      title: "Upper body",
      sets: {
        create: [
          { exerciseId: exercises[0].id, weight: 40, reps: 5, order: 1 },
          { exerciseId: exercises[3].id, weight: 20, reps: 8, order: 2 },
        ],
      },
    },
  });
  await login(page, "reviewer", "review-password");
  const row = page
    .locator(".workout-card")
    .filter({ hasText: "Evening session" });
  await expect(row).toContainText("Bench Press");
  await expect(row).toContainText("200 kg × reps");
  await row.getByRole("link", { name: "View", exact: true }).click();
  await expect(
    page.locator(".primary-nav [aria-current=page]"),
  ).toHaveAttribute("href", "/workouts");
  const deleteTrigger = page
    .locator(".workout-page > .card-actions")
    .getByRole("button", { name: "Delete", exact: true });
  await deleteTrigger.click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Cancel" })
    .click();
  await expect(deleteTrigger).toBeFocused();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Evening session",
  );
  await page.goto(
    `/calendar?year=${now.getFullYear()}&month=${now.getMonth() + 1}&day=${formatDateKey(now)}`,
  );
  await expect(page.locator(".selected-workout")).toHaveCount(2);
  await expect(page.locator(".selected-date-panel")).toContainText(
    "200 Volume",
  );
  const nextKey = formatDateKey(day(1));
  await page.locator(`.calendar-day-number[aria-label="${nextKey}"]`).click();
  await expect(
    page.locator(".calendar-day.selected .calendar-day-number"),
  ).toHaveAttribute("aria-label", nextKey);
  await expect(page.getByText("No workouts on this date.")).toBeVisible();
  await page.reload();
  await expect(
    page.locator(".calendar-day.selected .calendar-day-number"),
  ).toHaveAttribute("aria-label", nextKey);
  await page
    .locator(".selected-date-panel")
    .getByRole("link", { name: /^Create workout/ })
    .click();
  await expect(page.getByLabel("Date", { exact: true })).toHaveValue(nextKey);
  await page.goto("/workouts/new?date=2026-02-30");
  await expect(page.getByLabel("Date", { exact: true })).toHaveValue(
    formatDateKey(now),
  );
  await page.goto("/stats");
  const allVolume = await page
    .locator(".stats-card")
    .filter({ hasText: "Total volume" })
    .innerText();
  const range = page.locator(".page-header form");
  await choose(page, range.getByRole("combobox"), "Last 30 days");
  await range.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(/range=30/);
  await expect(
    page.locator(".stats-card").filter({ hasText: "Total volume" }),
  ).not.toHaveText(allVolume, { useInnerText: true });
  await expect(page.locator(".records-filter")).toContainText(
    "All-time records",
  );
  const recordForm = page.locator(".records-filter");
  await choose(
    page,
    recordForm.getByRole("combobox"),
    "Records in selected range",
  );
  await recordForm.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(/records=range/);
  await expect(
    page.locator(".stats-record-value").filter({ hasText: "500" }),
  ).toHaveCount(0);
  const point = page.locator(".training-chart g[role=button]").first();
  // Streaming can put chart markup in a hidden container before it is ready.
  await expect(point).toBeVisible();
  await point.focus();
  await expect(point).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".chart-tooltip").first()).not.toHaveText("\u00a0");
  await page.locator(".chart-data summary").first().click();
  await expect(page.locator(".chart-data dl").first()).toBeVisible();
  await page.goto("/exercises?sort=desc");
  const descending = await page.locator(".exercise-row h3").allTextContents();
  expect(descending).toEqual(
    [...descending].sort((a, b) => b.localeCompare(a)),
  );
  await page.goto("/exercises?sort=recent");
  await expect(
    page.locator(".exercise-row").filter({ hasText: "Bench Press" }),
  ).toContainText(formatDateKey(now));
  await page.goto("/stats?range=invalid");
  await expect(page.locator(".page-header .rt-SelectTrigger")).toHaveText(
    "All time",
  );
  await page.goto("/exercises");
  const countBefore = await prisma.exercise.count();
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/actions/createExerciseAction", async (route) => {
    if (route.request().method() === "POST") await gate;
    await route.continue();
  });
  try {
    await page
      .locator("#new-exercise")
      .getByLabel("Default name")
      .fill("Bench Press");
    await page
      .locator("#new-exercise")
      .getByRole("button", { name: "Create exercise", exact: true })
      .click();
    await expect(
      page
        .locator("#new-exercise")
        .getByRole("button", { name: "Create exercise", exact: true }),
    ).toBeDisabled();
  } finally {
    release();
  }
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "This exercise name already exists.",
  );
  expect(await prisma.exercise.count()).toBe(countBefore);
  await page.unroute("**/api/actions/createExerciseAction");
  await page
    .context()
    .addCookies([
      { name: "locale", value: "zh-TW", url: "http://localhost:8784" },
    ]);
  await page.reload();
  const t = dictionary("zh-TW");
  const benchRow = page
    .locator(".exercise-row")
    .filter({ hasText: "Bench Press" });
  await benchRow
    .getByRole("button", { name: t("addAlias"), exact: true })
    .click();
  const aliasForm = benchRow.locator("form");
  await aliasForm.getByLabel(t("locale"), { exact: true }).fill("en");
  await aliasForm.getByLabel(t("alias"), { exact: true }).fill("Bench Press");
  const aliasesBefore = await prisma.exerciseAlias.count();
  await aliasForm
    .getByRole("button", { name: t("addAlias"), exact: true })
    .click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    t("duplicateAlias"),
  );
  expect(await prisma.exerciseAlias.count()).toBe(aliasesBefore);
  // HTTP mutation errors retain the disclosure and draft instead of remounting the page.
  await expect(aliasForm.getByLabel(t("alias"), { exact: true })).toHaveValue(
    "Bench Press",
  );
  await aliasForm
    .getByLabel(t("alias"), { exact: true })
    .fill("Failure recovery alias");
  await aliasForm
    .locator('input[name="exerciseId"]')
    .evaluate((input: HTMLInputElement) => {
      input.value = "missing-exercise";
    });
  await aliasForm
    .getByRole("button", { name: t("addAlias"), exact: true })
    .click();
  await expect(aliasForm.getByRole("alert")).toHaveText(t("saveFailed"));
  await expect(aliasForm.getByLabel(t("alias"), { exact: true })).toHaveValue(
    "Failure recovery alias",
  );
  expect(await prisma.exerciseAlias.count()).toBe(aliasesBefore);
  // A reload restores the deliberately tampered resource ID without retrying the mutation.
  await page.reload();
  await expect(
    page
      .locator("main")
      .getByRole("heading", { name: t("exerciseLibrary"), exact: true }),
  ).toBeVisible();
  await page.context().clearCookies({ name: "locale" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await captureDashboard(page, info, "populated");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await login(page, "member", "member-password");
  await page.goto("/stats");
  await expect(page.locator(".stats-card")).toHaveCount(0);
  await expect(
    page.getByText("Log workouts and sets to see stats."),
  ).toBeVisible();
  await expect(page.locator(".training-chart")).toHaveCount(0);
  await page.goto("/exercises");
  await expect(
    page.locator(".exercise-row").filter({ hasText: "Bench Press" }),
  ).toContainText("Not used yet");
  await expect(
    page.getByRole("heading", { name: "Recently used", exact: true }),
  ).toHaveCount(0);
  await page.goto(
    `/calendar?year=${now.getFullYear()}&month=${now.getMonth() + 1}`,
  );
  await expect(page.locator(".calendar-workout")).toHaveCount(0);
  await page.goto(`/workouts/${old.id}`);
  await expect(page.getByRole("alert")).toHaveText(
    "This page or record was not found.",
  );
  await page.getByRole("button", { name: "Sign out" }).click();
});

test("bounded chart periods, setless sessions, and aggregated personal exercise usage", async ({
  page,
}, info) => {
  const user = await prisma.user.create({
    data: {
      username: "review-load",
      passwordHash: await bcrypt.hash("review-load-password", 12),
    },
  });
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 1,
  );
  await prisma.workout.createMany({
    data: [
      { userId: user.id, date: today, title: "Setless today" },
      {
        userId: user.id,
        date: new Date("9999-12-31T00:00:00"),
        title: "Extreme recorded date",
      },
    ],
  });
  await login(page, "review-load", "review-load-password");
  await page.goto("/workouts");
  await expect(
    page.locator(".stats-card").filter({ hasText: "Total sets" }),
  ).toContainText("0");
  await expect(
    page.locator(".stats-card").filter({ hasText: "Total volume" }),
  ).toContainText("0");
  await page.goto("/stats");
  await expect(
    page.locator(".stats-card").filter({ hasText: "Total workouts" }),
  ).toContainText("2");
  await expect(page.locator(".training-chart")).toHaveCount(1);
  await expect(
    page.locator("svg[aria-label='Workouts per period']"),
  ).toBeVisible();
  await expect(page.getByText(/Periods cover up to/)).toBeVisible();
  const values = await page.locator(".chart-data-row dd").allTextContents();
  expect(values.length).toBeLessThanOrEqual(52);
  expect(
    values.reduce((sum, value) => sum + Number(value.replaceAll(",", "")), 0),
  ).toBe(2);
  await expect(
    page.getByText("Training volume over time", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Exercise distribution", { exact: true }),
  ).toHaveCount(0);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await noOverflow(page);
    expect(
      (
        await new AxeBuilder({ page })

          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`aggregated-stats-${width}.png`),
      fullPage: true,
    });
  }
  await page.goto("/stats?range=30");
  await expect(page.locator(".training-chart")).toHaveCount(1);
  await expect(
    page.locator("svg[aria-label='Workouts per week']"),
  ).toBeVisible();
  await expect(
    page.getByText("Add sets to see volume and exercise statistics."),
  ).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await noOverflow(page);
    expect(
      (
        await new AxeBuilder({ page })

          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      caret: "initial",
      path: info.outputPath(`setless-stats-${width}.png`),
      fullPage: true,
    });
  }
  const bench = await prisma.exercise.findUniqueOrThrow({
    where: { slug: "bench-press" },
  });
  const squat = await prisma.exercise.findUniqueOrThrow({
    where: { slug: "squat" },
  });
  for (const [exerciseId, date] of [
    [bench.id, yesterday],
    [squat.id, today],
  ] as const) {
    await prisma.workout.create({
      data: {
        userId: user.id,
        date,
        sets: {
          create: Array.from({ length: 1000 }, (_, i) => ({
            exerciseId,
            order: i + 1,
            weight: i % 2 === 0 ? 0 : 2.5,
            reps: 3,
          })),
        },
      },
    });
  }
  await prisma.workout.createMany({
    data: Array.from({ length: 21 }, (_, i) => ({
      userId: user.id,
      date: yesterday,
      title: `Pagination fixture ${i}`,
    })),
  });
  for (const path of [
    "/workouts",
    "/workouts?page=2",
    "/workouts?q=Setless",
    "/workouts?q=NoMatchingTitle",
  ]) {
    await page.goto(path);
    await expect(
      page.locator(".stats-card").filter({ hasText: "Total sets" }),
    ).toContainText("2,000");
    await expect(
      page.locator(".stats-card").filter({ hasText: "Total volume" }),
    ).toContainText("7,500");
    await expect(page.locator(".workout-card")).toHaveCount(
      path === "/workouts"
        ? 20
        : path.includes("page=2")
          ? 5
          : path.includes("NoMatchingTitle")
            ? 0
            : 1,
    );
  }
  await page.goto("/exercises?sort=recent");
  await expect(
    page.locator(".stats-card").filter({ hasText: "Used exercises" }),
  ).toContainText("2");
  await expect(page.locator(".exercise-row h3").first()).toHaveText("Squat");
  await expect(
    page.locator(".exercise-row").filter({ hasText: "Bench Press" }),
  ).toContainText("1000 sets");
  await expect(
    page.locator(".exercise-row").filter({ hasText: "Bench Press" }),
  ).toContainText(formatDateKey(yesterday));
  await expect(
    page.locator(".exercise-row").filter({ hasText: "Squat" }),
  ).toContainText("1000 sets");
  await expect(
    page.locator(".exercise-row").filter({ hasText: "Plank" }),
  ).toContainText("Not used yet");
  await expect(page.locator(".recent-exercise")).toHaveCount(2);
  await expect(page.locator(".recent-exercise").first()).toContainText("Squat");
  await page.goto("/exercises?q=Bench&sort=recent");
  await expect(page.locator(".exercise-row")).toHaveCount(1);
  await expect(page.locator(".exercise-row")).toContainText("1000 sets");
  await expect(page.locator(".recent-exercise")).toHaveCount(2);
  await page.goto("/stats");
  await expect(page.locator(".training-chart")).toHaveCount(2);
  await expect(
    page.locator("svg[aria-label='Workouts per period'] g[role=button]"),
  ).toHaveCount(values.length);
  const result = await new AxeBuilder({ page })

    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(result.violations).toEqual([]);
  await page.getByRole("button", { name: "More", exact: true }).click();
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

        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(accessibility.violations, `${route} at ${width}px`).toEqual([]);
      await page.screenshot({
        caret: "initial",
        path: info.outputPath(`${route.replaceAll("/", "-")}-${name}.png`),
        fullPage: true,
      });
    }
  }
  await page.goto(workoutPath);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const first = page.locator("article.recorded-set").first();
  await first.locator("summary").click();
  await expect(first.locator('input[name="weight"]')).toHaveAttribute(
    "min",
    "0",
  );
  await expect(first.locator('input[name="weight"]')).toHaveAttribute(
    "step",
    "0.001",
  );
  await expect(first.locator('input[name="weight"]')).toHaveAttribute(
    "required",
    "",
  );
  await expect(first.locator('input[name="reps"]')).toHaveAttribute("min", "1");
  const trigger = first.getByRole("combobox", {
    name: "Exercise",
    exact: true,
  });
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
      caret: "initial",
      path: info.outputPath(`login-${width}.png`),
      fullPage: true,
    });
  }
});
