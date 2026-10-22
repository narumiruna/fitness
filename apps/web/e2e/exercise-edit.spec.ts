import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma } from "../../api/src/lib/prisma";
import { dictionary } from "../src/lib/translations";

const userIds: string[] = [];
const exerciseIds: string[] = [];

async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill("edit-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/workouts$/);
}

async function openNameEditor(page: Page) {
  const editor = page
    .locator("details")
    .filter({ has: page.locator("#edit-exercise") });
  if (
    !(await editor.evaluate((element) => (element as HTMLDetailsElement).open))
  ) {
    await editor.locator("summary").click();
  }
  return editor;
}

test.afterAll(async () => {
  try {
    // Deleting users also removes their workouts, sets, and sessions.
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.exercise.deleteMany({ where: { id: { in: exerciseIds } } });
  } finally {
    await prisma.$disconnect();
  }
});

test("exercise renaming preserves records and checks duplicates and permissions", async ({
  page,
}) => {
  const passwordHash = await bcrypt.hash("edit-password", 4);
  const owner = await prisma.user.create({
    data: { username: "edit-owner", passwordHash },
  });
  userIds.push(owner.id);
  const admin = await prisma.user.create({
    data: { username: "edit-admin", passwordHash, role: "ADMIN" },
  });
  userIds.push(admin.id);
  const exercise = await prisma.exercise.create({
    data: {
      slug: "edit-original",
      defaultName: "Edit Original",
      createdByUserId: owner.id,
      names: {
        create: { locale: "en", name: "Edit Original", isPrimary: true },
      },
      aliases: {
        create: {
          locale: "en",
          alias: "Edit Original",
          normalizedAlias: "edit original",
        },
      },
    },
  });
  exerciseIds.push(exercise.id);
  const protectedExercise = await prisma.exercise.create({
    data: {
      slug: "edit-protected",
      defaultName: "Edit Protected",
    },
  });
  exerciseIds.push(protectedExercise.id);
  const workout = await prisma.workout.create({
    data: {
      userId: owner.id,
      date: new Date(),
      sets: {
        create: { exerciseId: exercise.id, order: 1, weight: 20, reps: 5 },
      },
    },
  });
  await login(page, owner.username);
  await page.goto("/exercises");
  await page
    .locator(".exercise-row")
    .filter({ hasText: "Edit Original" })
    .getByRole("link", { name: "Edit exercise", exact: true })
    .click();
  const form = page.locator("#edit-exercise");
  const editor = page.locator("details").filter({ has: form });
  await expect(editor).toHaveAttribute("open", "");
  await expect(form.getByLabel("Default name")).toHaveValue("Edit Original");
  await form.getByLabel("Default name").fill("  Edit Renamed  ");
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Edit Renamed",
  );
  await expect(form.getByRole("status")).toHaveText("Saved.");
  await page.reload();
  await expect(form.getByLabel("Default name")).toHaveValue("Edit Renamed");
  const saved = await prisma.exercise.findUniqueOrThrow({
    where: { id: exercise.id },
    include: { names: true, aliases: true },
  });
  expect(saved.slug).toBe("edit-original");
  // Seed and legacy import must still find the same record by its original slug.
  expect(
    await prisma.exercise.findUnique({ where: { slug: "edit-original" } }),
  ).toMatchObject({ id: exercise.id, defaultName: "Edit Renamed" });
  expect(
    saved.names.filter((name) => name.isPrimary).map((name) => name.name),
  ).toEqual(["Edit Renamed"]);
  expect(saved.aliases.map((alias) => alias.normalizedAlias).sort()).toEqual([
    "edit original",
    "edit renamed",
  ]);
  expect(
    await prisma.workoutSet.findFirst({ where: { workoutId: workout.id } }),
  ).toMatchObject({ exerciseId: exercise.id, weight: 20, reps: 5 });
  await page.goto("/exercises?q=Edit%20Original");
  await expect(page.locator(".exercise-row")).toContainText("Edit Renamed");
  await page.goto(`/exercises/${exercise.id}`);
  for (const name of ["Edit Protected", "edit protected", "EDIT   PROTECTED"]) {
    await page.goto(`/exercises/${exercise.id}`);
    await expect(editor).not.toHaveAttribute("open");
    await openNameEditor(page);
    await form.getByLabel("Default name").fill(name);
    await form.getByRole("button", { name: "Save", exact: true }).click();
    await expect(form.getByRole("alert")).toContainText(
      "This exercise name already exists.",
    );
    await expect(editor).toHaveAttribute("open", "");
    await expect(form.getByLabel("Default name")).toHaveValue(name);
    await editor.locator("summary").click();
    await openNameEditor(page);
    await expect(form.getByLabel("Default name")).toHaveValue(name);
  }
  expect(
    await prisma.exercise.findUnique({ where: { id: exercise.id } }),
  ).toMatchObject({ defaultName: "Edit Renamed", slug: "edit-original" });
  // Alias-less imported exercises must also reserve their visible names.
  await prisma.exerciseAlias.create({
    data: {
      exerciseId: protectedExercise.id,
      locale: "en",
      alias: "Reserved Alias",
      normalizedAlias: "reserved alias",
    },
  });
  await page.goto(`/exercises/${exercise.id}`);
  await openNameEditor(page);
  await form.getByLabel("Default name").fill("Reserved Alias");
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await expect(form.getByRole("alert")).toContainText(
    "This exercise name already exists.",
  );
  expect(
    await prisma.exercise.findUnique({ where: { id: exercise.id } }),
  ).toMatchObject({ defaultName: "Edit Renamed" });
  expect(
    await prisma.exerciseName.count({
      where: { exerciseId: exercise.id, name: "Reserved Alias" },
    }),
  ).toBe(0);
  await page.goto(`/exercises/${protectedExercise.id}`);
  await expect(page.locator("#edit-exercise")).toHaveCount(0);
  await page.goto(`/exercises/${exercise.id}`);
  await openNameEditor(page);
  // Change the submitted ID, not a DOM value that hydration can restore.
  await page.route("**/api/actions/updateExerciseAction", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const body = route.request().postData() ?? "";
    expect(body).toContain(exercise.id);
    await route.continue({
      postData: body.replaceAll(exercise.id, protectedExercise.id),
    });
  });
  await form.getByLabel("Default name").fill("Unauthorized rename");
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toBeVisible();
  expect(
    await prisma.exercise.findUnique({ where: { id: protectedExercise.id } }),
  ).toMatchObject({ defaultName: "Edit Protected" });
  expect(
    await prisma.exercise.findUnique({ where: { id: exercise.id } }),
  ).toMatchObject({ defaultName: "Edit Renamed" });
  await page.unroute("**/api/actions/updateExerciseAction");
  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, "edit-admin");
  await page.goto(`/exercises/${protectedExercise.id}`);
  await openNameEditor(page);
  await form.getByLabel("Default name").fill("Admin Renamed");
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Admin Renamed",
  );
  await page.goto("/exercises?q=Edit%20Protected");
  await expect(page.locator(".exercise-row")).toContainText("Admin Renamed");
  expect(
    await prisma.exerciseName.findMany({
      where: { exerciseId: protectedExercise.id },
    }),
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: "Edit Protected", isPrimary: false }),
      expect.objectContaining({ name: "Admin Renamed", isPrimary: true }),
    ]),
  );
});

test("exercise identity and history precede collapsed editors in both locales", async ({
  page,
  context,
}) => {
  const key = randomUUID();
  const owner = await prisma.user.create({
    data: {
      username: `edit-layout-${key}`,
      passwordHash: await bcrypt.hash("edit-password", 4),
    },
  });
  userIds.push(owner.id);
  const exercise = await prisma.exercise.create({
    data: {
      slug: `edit-layout-${key}`,
      defaultName: "Identity movement",
      createdByUserId: owner.id,
      muscles: { create: { muscle: "chest", role: "PRIMARY" } },
      equipment: { create: { equipment: "barbell" } },
      aliases: {
        create: {
          alias: "Identity alias",
          normalizedAlias: `identity alias ${key}`,
          locale: "en",
        },
      },
    },
  });
  const shared = await prisma.exercise.create({
    data: { slug: `edit-empty-${key}`, defaultName: "Empty shared movement" },
  });
  exerciseIds.push(exercise.id, shared.id);
  await prisma.workout.create({
    data: {
      userId: owner.id,
      date: new Date(),
      title: "Identity workout",
      sets: {
        create: { exerciseId: exercise.id, order: 1, weight: 20, reps: 5 },
      },
    },
  });
  await login(page, owner.username);
  for (const locale of ["en", "zh-TW"] as const) {
    const t = dictionary(locale);
    await context.addCookies([
      { name: "locale", value: locale, url: "http://localhost:8784" },
    ]);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto(`/exercises/${exercise.id}`);
      const title = page.getByRole("heading", {
        level: 1,
        name: exercise.defaultName,
      });
      await expect(title).toBeInViewport();
      const metadata = page.getByRole("region", {
        name: t("metadata"),
        exact: true,
      });
      await expect(metadata).toContainText(t("chest"));
      await expect(metadata).toContainText(t("barbell"));
      await expect(
        page.locator("#edit-exercise").getByLabel(t("defaultName")),
      ).not.toBeVisible();
      await expect(page.locator("#edit-exercise-metadata")).not.toHaveAttribute(
        "open",
      );
      const order = await page.evaluate(() => {
        const heading = document.querySelector("h1");
        const metadata = document.querySelector(
          "[aria-label][class='meta-row']",
        );
        const history = document.querySelector(".agenda-list");
        const editor = document.getElementById("edit-exercise");
        if (!heading || !metadata || !history || !editor) return false;
        return Boolean(
          heading.compareDocumentPosition(metadata) &
            Node.DOCUMENT_POSITION_FOLLOWING &&
            metadata.compareDocumentPosition(history) &
              Node.DOCUMENT_POSITION_FOLLOWING &&
            history.compareDocumentPosition(editor) &
              Node.DOCUMENT_POSITION_FOLLOWING,
        );
      });
      expect(order).toBe(true);
      const aliases = page
        .locator("details")
        .filter({ has: page.locator(".alias-list") });
      await aliases.locator("summary").click();
      await expect(aliases).toContainText("Identity alias");
      await page.goto(`/exercises/${shared.id}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
      await expect(
        page.getByText(t("noExerciseHistory"), { exact: true }),
      ).toBeVisible();
      await expect(page.locator(".stats-card-grid")).toHaveCount(0);
      await expect(page.locator("#edit-exercise")).toHaveCount(0);
      await expect(page.locator("#edit-exercise-metadata")).toHaveCount(0);
    }
  }
});

test("failed exercise saves reopen the editor and retain name and metadata drafts", async ({
  page,
}) => {
  const key = randomUUID();
  const owner = await prisma.user.create({
    data: {
      username: `edit-recovery-${key}`,
      passwordHash: await bcrypt.hash("edit-password", 4),
    },
  });
  userIds.push(owner.id);
  const exercise = await prisma.exercise.create({
    data: {
      slug: `edit-recovery-${key}`,
      defaultName: "Recovery movement",
      createdByUserId: owner.id,
    },
  });
  exerciseIds.push(exercise.id);
  await login(page, owner.username);
  await page.goto(`/exercises/${exercise.id}`);
  const nameEditor = await openNameEditor(page);
  const nameForm = page.locator("#edit-exercise");
  await nameForm.getByLabel("Default name").fill("Unsent draft name");
  await nameEditor.locator("summary").click();
  await openNameEditor(page);
  await expect(nameForm.getByLabel("Default name")).toHaveValue(
    "Unsent draft name",
  );
  for (const action of [
    "updateExerciseAction",
    "saveMetadataAction",
  ] as const) {
    const editor =
      action === "updateExerciseAction"
        ? nameEditor
        : page.locator("#edit-exercise-metadata");
    if (action === "saveMetadataAction") {
      await editor.locator("summary").click();
      await editor
        .getByRole("group", { name: "Primary muscles" })
        .getByLabel("Chest", { exact: true })
        .check();
      await editor.getByLabel("Barbell", { exact: true }).check();
      await editor.locator("summary").click();
      await editor.locator("summary").click();
    }
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(`**/api/actions/${action}`, async (route) => {
      await gate;
      await route.fulfill({
        status: 500,
        json: { error: { code: "INTERNAL_ERROR" } },
      });
    });
    const request = page.waitForRequest(`**/api/actions/${action}`);
    await editor.getByRole("button", { name: "Save", exact: true }).click();
    await request;
    await editor.locator("summary").click();
    await expect(editor).not.toHaveAttribute("open");
    release?.();
    await expect(editor).toHaveAttribute("open", "");
    await expect(
      editor.getByText(dictionary("en")("saveFailed"), { exact: true }),
    ).toBeVisible();
    await page.unroute(`**/api/actions/${action}`);
  }
  await expect(nameForm.getByLabel("Default name")).toHaveValue(
    "Unsent draft name",
  );
  const metadata = page.locator("#edit-exercise-metadata");
  await expect(
    metadata
      .getByRole("group", { name: "Primary muscles" })
      .getByLabel("Chest", { exact: true }),
  ).toBeChecked();
  await expect(metadata.getByLabel("Barbell", { exact: true })).toBeChecked();
  await metadata.getByRole("button", { name: "Save", exact: true }).click();
  await expect(metadata.getByRole("status")).toHaveText("Saved.");
  await expect(
    page.getByRole("region", { name: "Exercise metadata", exact: true }),
  ).toContainText("Chest");
  expect(
    await prisma.exercise.findUnique({ where: { id: exercise.id } }),
  ).toMatchObject({ defaultName: "Recovery movement" });
  expect(
    await prisma.exerciseMuscle.count({
      where: { exerciseId: exercise.id, muscle: "chest" },
    }),
  ).toBe(1);
});
