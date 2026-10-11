import { cookies, headers } from "next/headers";
import { cache } from "react";
import { resolveLocale } from "@/lib/locales";
import { dictionary } from "@/lib/translations";

export type { Locale } from "@/lib/locales";
export { defaultLocale, supportedLocales } from "@/lib/locales";
export type { MessageKey } from "@/lib/translations";

export const getLocale = cache(async () => {
  const cookieStore = await cookies();
  const requestHeaders = await headers();
  return resolveLocale(
    cookieStore.get("locale")?.value,
    requestHeaders.get("accept-language"),
  );
});

export async function getDictionary() {
  return dictionary(await getLocale());
}
