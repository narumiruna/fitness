import { Cross2Icon, ExitIcon, HamburgerMenuIcon } from "@radix-ui/react-icons";
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
        <IconButton
          className="mobile-menu-trigger"
          highContrast
          variant="soft"
          aria-label={t("moreNavigation")}
          data-active={utilityActive || undefined}
        >
          <HamburgerMenuIcon />
        </IconButton>
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
            ["/measurements", t("measurements")],
            ["/data", t("dataTransfer")],
            ["/account/password", t("account")],
            ...(user?.role === "ADMIN" ? [["/admin/users", t("admin")]] : []),
          ].map(([to, label]) => (
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
