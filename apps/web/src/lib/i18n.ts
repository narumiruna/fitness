import { useSession } from "./session";
import { dictionary } from "./translations";

export type { Locale } from "./locales";
export { defaultLocale, supportedLocales } from "./locales";
export type { MessageKey } from "./translations";
export function useLocale() {
  return useSession().locale;
}
export function useDictionary() {
  return dictionary(useLocale());
}
