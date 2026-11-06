import { randomUUID } from "node:crypto";
import { expect, type Locator, test } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma } from "../../api/src/lib/prisma";
import { dictionary } from "../src/lib/translations";

// Exercise real touch events as well as keyboard activation at every viewport.
test.use({ hasTouch: true });
test.afterAll(async () => prisma.$disconnect());

async function expectChartGeometry(chart: Locator) {
  const svg = chart.locator("svg");
  await expect(svg).toBeVisible();
  // Wait for ResizeObserver after each viewport change, without reloading.
  await expect
    .poll(() =>
      svg.evaluate((element: SVGSVGElement) =>
        Math.abs(
          element.viewBox.baseVal.width - element.getBoundingClientRect().width,
        ),
      ),
    )
    .toBeLessThan(0.05);
  const geometry = await svg.evaluate((element: SVGSVGElement) => {
    const bounds = element.getBoundingClientRect();
    return {
      width: bounds.width,
      labels: [...element.querySelectorAll<SVGTextElement>(".chart-axis")].map(
        (label) => {
          const matrix = label.getScreenCTM();
          const rect = label.getBoundingClientRect();
          return {
            // Computed font-size alone misses the original viewBox scaling bug.
            renderedFontSize:
              Number.parseFloat(getComputedStyle(label).fontSize) *
              (matrix ? Math.hypot(matrix.c, matrix.d) : 0),
            left: rect.left - bounds.left,
            right: rect.right - bounds.left,
            top: rect.top - bounds.top,
            bottom: rect.bottom - bounds.top,
          };
        },
      ),
      targets: [
        ...element.querySelectorAll<SVGCircleElement>(".chart-point-target"),
      ].map((target) => {
        const rect = target.getBoundingClientRect();
        return {
          width: rect.width,
          height: rect.height,
          left: rect.left - bounds.left,
          right: rect.right - bounds.left,
          top: rect.top - bounds.top,
          bottom: rect.bottom - bounds.top,
        };
      }),
      height: bounds.height,
    };
  });
  expect(geometry.labels.length).toBeGreaterThanOrEqual(5);
  for (const label of geometry.labels) {
    expect(label.renderedFontSize).toBeGreaterThanOrEqual(10.99);
    expect(label.left).toBeGreaterThanOrEqual(-0.5);
    expect(label.right).toBeLessThanOrEqual(geometry.width + 0.5);
    expect(label.top).toBeGreaterThanOrEqual(0);
    expect(label.bottom).toBeLessThanOrEqual(geometry.height);
  }
  for (const target of geometry.targets) {
    const size = geometry.width < 480 ? 32 : 44;
    expect(target.width).toBeGreaterThanOrEqual(size - 0.05);
    expect(target.height).toBeGreaterThanOrEqual(size - 0.05);
    expect(target.width).toBeGreaterThanOrEqual(24);
    expect(target.height).toBeGreaterThanOrEqual(24);
    expect(target.left).toBeGreaterThanOrEqual(0);
    expect(target.right).toBeLessThanOrEqual(geometry.width);
    expect(target.top).toBeGreaterThanOrEqual(0);
    expect(target.bottom).toBeLessThanOrEqual(geometry.height);
  }
  // Date labels must not collide after the labels stop scaling down.
  const dates = await chart.locator(".chart-axis-date").evaluateAll((labels) =>
    labels.map((label) => {
      const rect = label.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      };
    }),
  );
  for (let i = 1; i < dates.length; i++) {
    const previous = dates[i - 1];
    const current = dates[i];
    expect(
      previous.right <= current.left || previous.bottom <= current.top,
    ).toBe(true);
  }
}

for (const locale of ["en", "zh-TW"] as const) {
  test(`chart labels, point targets, and exact values remain usable in ${locale}`, async ({
    page,
  }, info) => {
    const user = await prisma.user.create({
      data: {
        username: `chart-${randomUUID()}`,
        passwordHash: await bcrypt.hash("chart-password", 4),
      },
    });
    const t = dictionary(locale);
    const exactValue = 499.1234567890123;
    const targetValue = 499.1234567890122;
    const dates = Array.from(
      { length: 42 },
      (_, index) => new Date(2025, 0, 1 + index),
    );
    try {
      await prisma.bodyMeasurement.createMany({
        data: dates.map((date, index) => ({
          userId: user.id,
          date,
          weight: index === 0 ? exactValue : 70 + index / 100,
          // The second chart has empty metric data, not an empty page.
        })),
      });
      await prisma.bodyGoal.create({
        data: { userId: user.id, weight: targetValue },
      });
      await prisma.workout.createMany({
        data: [0, 14, 41].map((index) => ({
          userId: user.id,
          date: dates[index],
        })),
      });
      await page.goto("/login");
      await page.getByLabel("Username", { exact: true }).fill(user.username);
      await page.getByLabel("Password", { exact: true }).fill("chart-password");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page).toHaveURL(/\/workouts$/);
      await page
        .context()
        .addCookies([
          { name: "locale", value: locale, url: new URL(page.url()).origin },
        ]);

      for (const state of ["dense", "sparse", "bar"] as const) {
        if (state === "sparse") {
          await prisma.bodyMeasurement.deleteMany({
            where: { userId: user.id, date: { not: dates[0] } },
          });
        }
        await page.goto(state === "bar" ? "/stats" : "/measurements");
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        const chart = page.locator(".training-chart").first();
        await expect(chart).toBeVisible();
        const points = chart.locator("g[role=button]");
        if (state !== "bar") {
          await expect(points).toHaveCount(state === "dense" ? 42 : 1);
        } else {
          await expect(chart.locator(".chart-bar").first()).toBeVisible();
          await expect(
            chart.locator('.chart-bar[height="0"]').first(),
          ).toBeAttached();
        }
        for (const width of [1440, 390, 320]) {
          await page.setViewportSize({ width, height: 900 });
          await expectChartGeometry(chart);
          if (state !== "bar") {
            const empty = page.locator(".training-chart").nth(1);
            await expect(empty.locator("g[role=button]")).toHaveCount(0);
            await expectChartGeometry(empty);
            const target = chart.locator(".chart-target");
            await expect(target).toHaveText(
              `${t("goal")}: ${new Intl.NumberFormat(locale, { maximumFractionDigits: 20 }).format(targetValue)}`,
            );
            const legend = await target.boundingBox();
            const plot = await chart.locator("svg").boundingBox();
            if (!legend || !plot) throw new Error("Missing target or plot");
            expect(legend.y + legend.height).toBeLessThanOrEqual(plot.y);
            await expect(
              chart.locator('line[stroke-dasharray="5 5"]'),
            ).toHaveCount(1);
          }
          if (state === "sparse") {
            await chart.screenshot({
              path: info.outputPath(`chart-${locale}-${width}.png`),
            });
          }
          const summary = chart.locator(".chart-data summary");
          if (
            !(await chart
              .locator(".chart-data")
              .evaluate((el) => (el as HTMLDetailsElement).open))
          ) {
            await summary.focus();
            await page.keyboard.press("Enter");
          }
          await expect(chart.locator(".chart-data dl")).toBeVisible();
          const rows = chart.locator(".chart-data-row");
          await expect(rows).toHaveCount(await points.count());
          const count = await points.count();
          const indexes = [...new Set([0, Math.floor(count / 2), count - 1])];
          for (const index of indexes) {
            const row = rows.nth(index);
            const expected = `${await row.locator("dt").innerText()}: ${await row.locator("dd").innerText()}`;
            const point = points.nth(index);
            await expect(point).toHaveAttribute("aria-label", expected);
            await point.focus();
            await page.keyboard.press(index === 0 ? "Enter" : "Space");
            await expect(chart.locator(".chart-tooltip")).toHaveText(expected);
            if (state === "dense") {
              const marker = point.locator(".chart-point");
              await marker.scrollIntoViewIfNeeded();
              const bounds = await marker.boundingBox();
              if (!bounds) throw new Error("Missing dense chart marker");
              await page.touchscreen.tap(
                bounds.x + bounds.width / 2,
                bounds.y + bounds.height / 2,
              );
              await expect(chart.locator(".chart-tooltip")).toHaveText(
                expected,
              );
            }
          }
          if (state === "sparse") {
            const expected = new Intl.NumberFormat(locale, {
              maximumFractionDigits: 20,
            }).format(exactValue);
            await expect(rows.locator("dd")).toHaveText(expected);
            // Tap outside the visible 8px marker, but inside its 32px hit target.
            const hit = chart.locator(".chart-point-target").first();
            await summary.focus();
            await hit.scrollIntoViewIfNeeded();
            const bounds = await hit.boundingBox();
            if (!bounds) throw new Error("Missing point target");
            await page.touchscreen.tap(
              bounds.x + bounds.width / 2 + 12,
              bounds.y + bounds.height / 2,
            );
            await expect(chart.locator(".chart-tooltip")).toContainText(
              expected,
            );
          }
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
          ).toBeLessThanOrEqual(width);
        }
      }
    } finally {
      await prisma.user.delete({ where: { id: user.id } });
    }
  });
}
