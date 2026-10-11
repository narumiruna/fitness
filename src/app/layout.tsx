import { ActivityLogIcon, ExitIcon, PersonIcon } from "@radix-ui/react-icons";
import { Box, Button, Flex, Link, Theme } from "@radix-ui/themes";
import type { Metadata } from "next";
import NextLink from "next/link";
import type { ReactNode } from "react";
import { logoutAction } from "@/app/actions/auth";
import { Navigation } from "@/components/navigation";
import { PageErrorMessagesProvider } from "@/components/page-error";
import "@radix-ui/themes/styles.css";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Fitness",
  description: "A strength training tracker.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const user = await getCurrentUser();
  const t = await getDictionary();

  return (
    <html lang="en">
      <body>
        <Theme
          accentColor="teal"
          grayColor="slate"
          appearance="light"
          radius="medium"
        >
          <Box className="shell">
            <Flex
              asChild
              align="center"
              justify="between"
              gap="4"
              className="topbar"
            >
              <header>
                <Link highContrast asChild weight="bold" size="4">
                  <NextLink className="brand" href="/">
                    <ActivityLogIcon aria-hidden="true" />
                    {t("appName")}
                  </NextLink>
                </Link>
                {user ? (
                  <Navigation
                    label={t("primaryNavigation")}
                    labels={[
                      t("workouts"),
                      t("calendar"),
                      t("stats"),
                      t("exercises"),
                      t("measurements"),
                      t("dataTransfer"),
                    ]}
                  />
                ) : null}
                <Flex asChild align="center" wrap="wrap" gap="3">
                  <nav className="secondary-nav" aria-label={t("account")}>
                    {user ? (
                      <>
                        {user.role === "ADMIN" ? (
                          <Link highContrast asChild>
                            <NextLink href="/admin/users">
                              {t("admin")}
                            </NextLink>
                          </Link>
                        ) : null}
                        <Link highContrast asChild>
                          <NextLink href="/account/password">
                            <PersonIcon aria-hidden="true" /> {t("account")}
                          </NextLink>
                        </Link>
                        <form action={logoutAction}>
                          <Button highContrast variant="ghost" type="submit">
                            <ExitIcon aria-hidden="true" />
                            {t("signOut")}
                          </Button>
                        </form>
                      </>
                    ) : (
                      <Link highContrast asChild>
                        <NextLink href="/login">{t("signIn")}</NextLink>
                      </Link>
                    )}
                  </nav>
                </Flex>
              </header>
            </Flex>
            <Box asChild className="main">
              <main>
                <PageErrorMessagesProvider
                  message={t("pageError")}
                  retry={t("tryAgain")}
                >
                  {children}
                </PageErrorMessagesProvider>
              </main>
            </Box>
          </Box>
        </Theme>
      </body>
    </html>
  );
}
