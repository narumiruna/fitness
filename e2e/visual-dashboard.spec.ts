import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

test("reference dashboard screenshots and responsive accessibility", async ({
  page,
}, info) => {
  const key = randomUUID();
  const user = await prisma.user.create({
    data: {
      username: `visual-${key}`,
      passwordHash: await bcrypt.hash("visual-password", 4),
    },
  });
  const exercises: { id: string }[] = [];
  const names = [
    "Bench Press",
    "Deadlift",
    "Leg Press",
    "Overhead Press",
    "Pull Up",
    "Romanian Deadlift",
    "Squat",
    "Plank",
  ];
  try {
    for (const [i, name] of names.entries())
      exercises.push(
        await prisma.exercise.create({
          data: {
            slug: `${key}-${i}`,
            defaultName: name,
            createdByUserId: user.id,
            muscles: {
              create: {
                muscle: [
                  "chest",
                  "back",
                  "quadriceps",
                  "shoulders",
                  "back",
                  "hamstrings",
                  "quadriceps",
                  "core",
                ][i],
                role: "PRIMARY",
              },
            },
            equipment: {
              create: {
                equipment: i === 4 || i === 7 ? "bodyweight" : "barbell",
              },
            },
          },
        }),
      );
    const now = new Date();
    for (let i = 0; i < 24; i++)
      await prisma.workout.create({
        data: {
          userId: user.id,
          date: new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate() - i * 3,
          ),
          title: ["Lower body", "Upper body", "Full body"][i % 3],
          activeSeconds: 3480,
          notes:
            i === 0
              ? "Felt strong today. Good depth on squats and increased RDL weight."
              : null,
          sets: {
            create: Array.from({ length: 6 }, (_, j) => ({
              exerciseId: exercises[(i + j) % 8].id,
              order: j + 1,
              weight: 40 + i + j * 5,
              reps: 8,
            })),
          },
        },
      });
    for (const title of ["Push", "Pull", "Legs", "Full body"])
      await prisma.workoutTemplate.create({
        data: {
          userId: user.id,
          title,
          sets: {
            create: exercises.slice(0, 4).map((e, i) => ({
              exerciseId: e.id,
              order: i + 1,
              weight: 40,
              reps: 8,
            })),
          },
        },
      });
    await page.goto("/login");
    await page.getByLabel("Username", { exact: true }).fill(user.username);
    await page.getByLabel("Password", { exact: true }).fill("visual-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/workouts$/);
    for (const route of ["workouts", "calendar", "stats", "exercises"]) {
      await page.goto(`/${route}`);
      for (const width of [1440, 768, 390]) {
        await page.setViewportSize({ width, height: 1080 });
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(
          new RegExp(route, "i"),
        );
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        expect(
          (
            await new AxeBuilder({ page })
              .exclude("nextjs-portal")
              .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
              .analyze()
          ).violations,
        ).toEqual([]);
        await page.screenshot({
          path: info.outputPath(`${route}-${width}-viewport.png`),
          animations: "disabled",
        });
        await page.screenshot({
          path: info.outputPath(`${route}-${width}.png`),
          fullPage: true,
          animations: "disabled",
        });
      }
    }
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.exercise.deleteMany({
      where: { id: { in: exercises.map((e) => e.id) } },
    });
    await prisma.$disconnect();
  }
});
