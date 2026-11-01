import {
  ArchiveIcon,
  Cross2Icon,
  ExitIcon,
  GearIcon,
  HamburgerMenuIcon,
  PersonIcon,
  RulerSquareIcon,
} from "@radix-ui/react-icons";
import { Button, Dialog, IconButton, Link } from "@radix-ui/themes";
import { useRef, useState } from "react";
import { Link as RouterLink, useLocation } from "react-router-dom";
import { logoutAction } from "@/api/actions";
import { useDictionary } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { ActionForm } from "./action-form";

export function AccountMenu() {
  const t = useDictionary();
  const { user } = useSession();
  const { pathname } = useLocation();
  const utilityActive = ["/measurements", "/data", "/account", "/admin"].some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
  const [open, setOpen] = useState(false);
  const navigating = useRef(false);
  const followLink = () => {
    navigating.current = true;
    setOpen(false);
  };
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger>
        <Button
          className="mobile-menu-trigger"
          highContrast
          variant="soft"
          aria-label={t("moreNavigation")}
          data-active={utilityActive || undefined}
        >
          <HamburgerMenuIcon aria-hidden="true" />
          <span>{t("moreNavigation")}</span>
        </Button>
      </Dialog.Trigger>
      <Dialog.Content
        className="utility-menu"
        maxWidth="360px"
        aria-describedby={undefined}
        onCloseAutoFocus={(event) => {
          if (navigating.current) {
            event.preventDefault();
            navigating.current = false;
            document
              .getElementById("main-content")
              ?.focus({ preventScroll: true });
          }
        }}
      >
        <div className="section-heading">
          <Dialog.Title mb="0">{t("moreNavigation")}</Dialog.Title>
          <Dialog.Close>
            <IconButton
              variant="ghost"
              color="gray"
              aria-label={t("closeNavigation")}
            >
              <Cross2Icon />
            </IconButton>
          </Dialog.Close>
        </div>
        <nav className="utility-menu-links" aria-label={t("account")}>
          {[
            {
              to: "/measurements",
              label: t("measurements"),
              Icon: RulerSquareIcon,
            },
            { to: "/data", label: t("dataTransfer"), Icon: ArchiveIcon },
            { to: "/account/password", label: t("account"), Icon: PersonIcon },
            ...(user?.role === "ADMIN"
              ? [{ to: "/admin/users", label: t("admin"), Icon: GearIcon }]
              : []),
          ].map(({ to, label, Icon }) => (
            <Link key={to} highContrast asChild>
              <RouterLink
                to={to}
                onClick={followLink}
                aria-current={
                  pathname === to ||
                  (to === "/account/password" &&
                    pathname.startsWith("/account/"))
                    ? "page"
                    : undefined
                }
              >
                <Icon aria-hidden="true" />
                {label}
              </RouterLink>
            </Link>
          ))}
          <ActionForm action={logoutAction}>
            <Button highContrast variant="soft" type="submit">
              <ExitIcon aria-hidden="true" />
              {t("signOut")}
            </Button>
          </ActionForm>
        </nav>
      </Dialog.Content>
    </Dialog.Root>
  );
}
