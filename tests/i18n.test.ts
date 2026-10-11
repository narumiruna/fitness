import assert from "node:assert/strict";
import test from "node:test";
import { formatMonthTitle } from "../src/lib/calendar";
import { isSupportedLocale, resolveLocale } from "../src/lib/locales";
import { englishMessages } from "../src/lib/messages";
import { calculateStats } from "../src/lib/stats-calculations";
import { dictionary, translations } from "../src/lib/translations";

test("saved language overrides browser preferences", () => {
  assert.equal(resolveLocale("en", "zh-TW"), "en");
  assert.equal(resolveLocale("zh-TW", "en-US"), "zh-TW");
  assert.equal(isSupportedLocale("fr"), false);
  assert.equal(isSupportedLocale(null), false);
});

test("browser language matching respects quality and falls back to English", () => {
  for (const [header, expected] of [
    ["zh-Hant-TW,en;q=0.8", "zh-TW"],
    ["fr,zh-HK;q=0.9,en;q=0.8", "zh-TW"],
    ["zh-TW;q=0.2,en-US;q=0.9", "en"],
    ["zh-TW;q=0,en;q=0.1", "en"],
    ["zh-TW;q=invalid,en", "en"],
    ["zh-TW;q=2,en", "en"],
    ["fr,ja", "en"],
    ["en-GB,zh-TW", "en"],
  ])
    assert.equal(resolveLocale("invalid", header), expected);
  assert.equal(resolveLocale(undefined, null), "en");
});

test("all dictionaries have every English key and preserve placeholders", () => {
  for (const [locale, messages] of Object.entries(translations)) {
    assert.deepEqual(
      Object.keys(messages).sort(),
      Object.keys(englishMessages).sort(),
    );
    for (const key of Object.keys(
      englishMessages,
    ) as (keyof typeof englishMessages)[]) {
      assert.ok(messages[key].trim(), `${locale}.${key}`);
      assert.deepEqual(
        messages[key].match(/\{\w+\}/g)?.sort() ?? [],
        englishMessages[key].match(/\{\w+\}/g)?.sort() ?? [],
        `${locale}.${key}`,
      );
    }
  }
  assert.equal(dictionary("zh-TW")("signIn"), "登入");
  assert.equal(dictionary("en")("signIn"), "Sign in");
});

test("calendar and statistics localize labels without changing keys or values", () => {
  const date = new Date(2026, 9, 12);
  assert.equal(
    formatMonthTitle(2026, 10, "zh-TW"),
    new Intl.DateTimeFormat("zh-TW", { month: "long", year: "numeric" }).format(
      date,
    ),
  );
  const workouts = [{ date, sets: [] }];
  const en = calculateStats(workouts, "all", date, "en");
  const zh = calculateStats(workouts, "all", date, "zh-TW");
  assert.deepEqual(zh.overview, en.overview);
  assert.deepEqual(
    zh.daily.map(({ key, value }) => ({ key, value })),
    en.daily.map(({ key, value }) => ({ key, value })),
  );
  assert.notEqual(zh.daily[0].label, en.daily[0].label);
  assert.notEqual(zh.weekly[0].label, en.weekly[0].label);
  assert.notEqual(zh.monthlyTrend[0].label, en.monthlyTrend[0].label);
});
