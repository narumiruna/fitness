import { Link, Text } from "@radix-ui/themes";
import type { ReactNode, RefObject } from "react";
import { NavLink } from "react-router-dom";
import { useDictionary } from "@/lib/i18n";

const accountLinks = [
  { to: "/account/password", label: "changePassword" },
  { to: "/account/passkeys", label: "passkeys" },
  { to: "/account/connections", label: "mcpConnections" },
] as const;

export function AccountSettingsLayout({
  children,
  passwordRecoveryRef,
  busy,
}: {
  children: ReactNode;
  passwordRecoveryRef?: RefObject<HTMLAnchorElement | null>;
  busy?: boolean;
}) {
  const t = useDictionary();
  return (
    <section className="account-settings" aria-busy={busy}>
      <Text as="p" size="6" weight="bold">
        {t("accountSettings")}
      </Text>
      <nav className="account-settings-nav" aria-label={t("accountSecurity")}>
        {accountLinks.map(({ to, label }) => (
          <Link key={to} highContrast asChild>
            <NavLink
              to={to}
              end
              className="account-settings-link"
              ref={to === "/account/password" ? passwordRecoveryRef : undefined}
            >
              {t(label)}
            </NavLink>
          </Link>
        ))}
      </nav>
      <div className="account-settings-content">{children}</div>
    </section>
  );
}
