export const languageOptions = [
  { locale: "en", label: "English" },
  { locale: "zh-TW", label: "正體中文" },
] as const;

export type Locale = (typeof languageOptions)[number]["locale"];
export const defaultLocale: Locale = "en";
export const supportedLocales = languageOptions.map(({ locale }) => locale);

export function isSupportedLocale(value: unknown): value is Locale {
  return languageOptions.some((option) => option.locale === value);
}

export function resolveLocale(
  saved: unknown,
  acceptLanguage: string | null,
): Locale {
  if (isSupportedLocale(saved)) return saved;
  const preferences = (acceptLanguage ?? "")
    .split(",")
    .map((entry) => {
      const [language, ...parameters] = entry.trim().split(";");
      const quality = parameters.find((parameter) =>
        parameter.trim().startsWith("q="),
      );
      return {
        language: language.toLowerCase(),
        quality: quality ? Number(quality.trim().slice(2)) : 1,
      };
    })
    .filter(({ quality }) => quality > 0 && quality <= 1)
    .sort((a, b) => b.quality - a.quality);
  for (const { language } of preferences) {
    const base = language.split("-")[0];
    if (base === "zh") return "zh-TW";
    if (base === "en") return "en";
  }
  return defaultLocale;
}
