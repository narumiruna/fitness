import type { Locale } from "@/lib/locales";
import { englishMessages } from "@/lib/messages";
import { traditionalChineseMessages } from "@/lib/messages-zh-tw";

export type MessageKey = keyof typeof englishMessages;
export const translations = {
  en: englishMessages,
  "zh-TW": traditionalChineseMessages,
} satisfies Record<Locale, Record<MessageKey, string>>;

export function dictionary(locale: Locale) {
  return (key: MessageKey): string =>
    translations[locale][key] ?? englishMessages[key];
}
