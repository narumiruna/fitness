import {
  Button,
  Callout,
  Card,
  Flex,
  Heading,
  Link,
  Text,
  TextField,
} from "@radix-ui/themes";
import { useId, useState } from "react";
import { Link as RouterLink, useLocation } from "react-router-dom";
import { changePasswordAction } from "@/api/actions";
import { useSearch } from "@/api/views";
import { ActionForm } from "@/components/action-form";
import { useDictionary } from "@/lib/i18n";

export default function ChangePasswordPage() {
  const t = useDictionary();
  const params = useSearch();
  const location = useLocation();
  const requirementsId = useId();
  const mismatchId = useId();
  const currentErrorId = useId();
  const [mismatch, setMismatch] = useState(false);
  const [newInvalid, setNewInvalid] = useState(false);
  const [currentEditedAt, setCurrentEditedAt] = useState<string | null>(null);
  const currentError =
    params.error === "current" && currentEditedAt !== location.key;
  return (
    <section className="narrow stack">
      <div className="page-header">
        <div>
          <Heading as="h1" size="8">
            {t("changePassword")}
          </Heading>
        </div>
      </div>
      <Flex asChild gap="4" wrap="wrap">
        <nav aria-label={t("accountSecurity")}>
          <Link highContrast asChild weight="bold">
            <RouterLink to="/account/password" aria-current="page">
              {t("changePassword")}
            </RouterLink>
          </Link>
          <Link highContrast asChild>
            <RouterLink to="/account/passkeys">{t("passkeys")}</RouterLink>
          </Link>
        </nav>
      </Flex>
      <Link highContrast asChild>
        <RouterLink to="/account/connections">{t("mcpConnections")}</RouterLink>
      </Link>
      <Card asChild>
        <ActionForm
          action={changePasswordAction}
          className="form-grid"
          onSubmit={(event) => {
            const form = event.currentTarget;
            const data = new FormData(form);
            if (data.get("newPassword") !== data.get("confirmPassword")) {
              event.preventDefault();
              setMismatch(true);
              const confirm = form.elements.namedItem("confirmPassword");
              if (confirm instanceof HTMLInputElement) confirm.focus();
            } else setMismatch(false);
          }}
          onInput={(event) => {
            if (!mismatch) return;
            const data = new FormData(event.currentTarget);
            if (data.get("newPassword") === data.get("confirmPassword"))
              setMismatch(false);
          }}
        >
          {params.changed ? (
            <Callout.Root color="green" role="status">
              <Callout.Text>{t("passwordChanged")}</Callout.Text>
            </Callout.Root>
          ) : null}
          {params.error && params.error !== "current" ? (
            <Callout.Root color="red" role="alert">
              <Callout.Text>{t("changePasswordError")}</Callout.Text>
            </Callout.Root>
          ) : null}
          <Text as="label" size="2" weight="medium" className="field-label">
            {t("currentPassword")}
            <TextField.Root
              autoComplete="current-password"
              name="currentPassword"
              required
              type="password"
              maxLength={256}
              aria-invalid={currentError || undefined}
              aria-describedby={currentError ? currentErrorId : undefined}
              onChange={() => setCurrentEditedAt(location.key)}
            />
          </Text>
          {currentError ? (
            <Text as="p" id={currentErrorId} role="alert" size="2" color="red">
              {t("currentPasswordError")}
            </Text>
          ) : null}
          <Text as="label" size="2" weight="medium" className="field-label">
            {t("newPassword")}
            <TextField.Root
              autoComplete="new-password"
              minLength={8}
              maxLength={256}
              name="newPassword"
              required
              type="password"
              aria-describedby={requirementsId}
              aria-invalid={newInvalid || undefined}
              onInvalid={() => setNewInvalid(true)}
              onChange={(event) => {
                if (newInvalid)
                  setNewInvalid(!event.currentTarget.validity.valid);
              }}
            />
          </Text>
          <Text
            as="p"
            id={requirementsId}
            size="2"
            color={newInvalid ? "red" : "gray"}
            role={newInvalid ? "alert" : undefined}
          >
            {t("passwordRequirements")}
          </Text>
          <Text as="label" size="2" weight="medium" className="field-label">
            {t("confirmPassword")}
            <TextField.Root
              autoComplete="new-password"
              maxLength={256}
              name="confirmPassword"
              required
              type="password"
              aria-invalid={mismatch || undefined}
              aria-describedby={mismatch ? mismatchId : undefined}
            />
          </Text>
          {mismatch ? (
            <Text as="p" id={mismatchId} role="alert" size="2" color="red">
              {t("passwordMismatch")}
            </Text>
          ) : null}
          <Button highContrast type="submit">
            {t("changePassword")}
          </Button>
        </ActionForm>
      </Card>
    </section>
  );
}
