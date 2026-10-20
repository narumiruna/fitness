import { isSupportedLocale } from "@narumitw/fitness-contracts";
import { cookies } from "../request-context.js";

export async function setLocaleAction(locale: string) {
  if (!isSupportedLocale(locale)) return false;
  (await cookies()).set("locale", locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return true;
}
