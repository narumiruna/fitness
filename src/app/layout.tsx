import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAction } from "@/app/actions/auth";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Fitness",
  description: "A strength training tracker.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const user = await getCurrentUser();
  const t = await getDictionary();

  return (
    <html lang="en">
      <body>
        <div className="shell">
          <header className="topbar">
            <Link className="brand" href="/">
              {t("appName")}
            </Link>
            <nav className="nav" aria-label="Primary">
              {user ? (
                <>
                  <Link href="/workouts">{t("workouts")}</Link>
                  <Link href="/exercises">{t("exercises")}</Link>
                  {user.role === "ADMIN" ? (
                    <Link href="/admin/users">{t("admin")}</Link>
                  ) : null}
                  <Link href="/account/password">{t("account")}</Link>
                  <form action={logoutAction}>
                    <button className="link-button" type="submit">
                      {t("signOut")}
                    </button>
                  </form>
                </>
              ) : (
                <Link href="/login">{t("signIn")}</Link>
              )}
            </nav>
          </header>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
