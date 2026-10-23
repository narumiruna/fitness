import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma } from "../../api/src/lib/prisma";
import { dictionary } from "../src/lib/translations";

let userId: string | undefined;

test.afterAll(async () => {
  try {
    if (userId) {
      await prisma.exercise.deleteMany({ where: { createdByUserId: userId } });
      await prisma.user.delete({ where: { id: userId } });
    }
  } finally {
    await prisma.$disconnect();
  }
});

test("distinct Chinese names and colliding mixed names work without admitting duplicates", async ({
  page,
  context,
}) => {
  const key = randomUUID();
  const user = await prisma.user.create({
    data: {
      username: `unicode-${key}`,
      passwordHash: await bcrypt.hash("unicode-password", 4),
    },
  });
  userId = user.id;
  const legacy = await prisma.exercise.create({
    data: { slug: "", defaultName: "回歸舊版動作", createdByUserId: user.id },
  });
  // HTTP CSV imports can create exercises without name or alias records.
  const imported = await prisma.exercise.create({
    data: {
      slug: `unicode-${key}-${randomUUID()}`,
      defaultName: "回歸匯入動作",
      createdByUserId: user.id,
    },
  });

  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill(user.username);
  await page.getByLabel("Password", { exact: true }).fill("unicode-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/workouts$/);
  await context.addCookies([
    { name: "locale", value: "zh-TW", url: new URL(page.url()).origin },
  ]);
  const t = dictionary("zh-TW");
  const form = page.locator("#new-exercise");
  async function submitName(name: string) {
    await page.goto("/exercises");
    await form.getByLabel(t("defaultName"), { exact: true }).fill(name);
    await form
      .getByRole("button", { name: t("createExercise"), exact: true })
      .click();
  }
  async function createName(name: string) {
    await submitName(name);
    await expect(page).toHaveURL(/\/exercises\?created=/);
    const id = new URL(page.url()).searchParams.get("created");
    if (!id) throw new Error("Missing created exercise ID");
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
    const exercise = await prisma.exercise.findUniqueOrThrow({
      where: { id },
    });
    expect(exercise.defaultName).toBe(name);
    expect(exercise.slug).not.toBe("");
    return exercise;
  }
  async function rejectDuplicate(name: string) {
    const before = await prisma.exercise.count({
      where: { createdByUserId: user.id },
    });
    await submitName(name);
    await expect(page).toHaveURL(/\/exercises\?error=duplicate/);
    await expect(page.locator("main").getByRole("alert")).toHaveText(
      t("duplicateExercise"),
    );
    expect(
      await prisma.exercise.count({ where: { createdByUserId: user.id } }),
    ).toBe(before);
  }

  const squat = await createName("回歸深蹲");
  const deadlift = await createName("回歸硬舉");
  expect(squat.slug).not.toBe(deadlift.slug);
  await rejectDuplicate("  回歸深蹲  ");
  await rejectDuplicate(imported.defaultName);
  await rejectDuplicate(legacy.defaultName);

  const prefix = `Unicode ${key} Press`;
  const ascii = await createName(prefix);
  const first = await createName(`${prefix} 中文`);
  const second = await createName(`${prefix} 日文`);
  const punctuation = await createName(prefix.replaceAll(" ", "-"));
  expect(
    new Set([ascii.slug, first.slug, second.slug, punctuation.slug]).size,
  ).toBe(4);
  await rejectDuplicate(
    ` ${prefix.toUpperCase().replaceAll(" ", "   ")} 中文 `,
  );

  await page.goto(`/exercises/${squat.id}#edit-exercise`);
  const editor = page.locator("#edit-exercise");
  await editor.getByLabel(t("defaultName"), { exact: true }).fill("回歸前蹲");
  await editor.getByRole("button", { name: t("save"), exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("回歸前蹲");
  await rejectDuplicate("回歸前蹲");
  await rejectDuplicate("回歸深蹲");
  expect(
    await prisma.exercise.findUnique({ where: { id: squat.id } }),
  ).toMatchObject({
    defaultName: "回歸前蹲",
    slug: squat.slug,
  });
  expect(
    await prisma.exercise.findUnique({ where: { id: legacy.id } }),
  ).toMatchObject({
    slug: "",
    defaultName: legacy.defaultName,
  });
  await page.reload();
  await expect(page.locator("main").getByRole("alert")).toHaveText(
    t("duplicateExercise"),
  );
});
