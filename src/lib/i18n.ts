import { cookies } from "next/headers";
import { englishMessages as enMessages } from "@/lib/messages";

export const defaultLocale = "en";
export const supportedLocales = ["en", "zh-TW"] as const;

export type Locale = (typeof supportedLocales)[number];

const messages: Record<Locale, Partial<typeof enMessages>> = {
  en: enMessages,
  "zh-TW": {
    appName: "Fitness",
  },
};

export type MessageKey = keyof typeof enMessages;

export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const locale = cookieStore.get("locale")?.value;

  if (isSupportedLocale(locale)) {
    return locale;
  }

  return defaultLocale;
}

export async function getDictionary() {
  const locale = await getLocale();

  return function t(key: MessageKey) {
    return messages[locale][key] ?? enMessages[key];
  };
}

function isSupportedLocale(value: string | undefined): value is Locale {
  return supportedLocales.some((locale) => locale === value);
}
