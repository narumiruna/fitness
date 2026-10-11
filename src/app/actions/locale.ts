"use server";

import { cookies } from "next/headers";
import { isSupportedLocale } from "@/lib/locales";

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
