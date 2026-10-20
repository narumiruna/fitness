import {
  Button,
  Callout,
  Card,
  Heading,
  Link,
  Text,
  TextField,
} from "@radix-ui/themes";
import { Link as RouterLink } from "react-router-dom";
import { changePasswordAction } from "@/api/actions";
import { useSearch } from "@/api/views";
import { ActionForm } from "@/components/action-form";
import { useDictionary } from "@/lib/i18n";

export default function ChangePasswordPage() {
  const t = useDictionary();
  const params = useSearch();
  return (
    <section className="narrow stack">
      <div className="page-header">
        <div>
          <Heading as="h1" size="8">
            {t("changePassword")}
          </Heading>
        </div>
      </div>
      <Link highContrast asChild>
        <RouterLink to="/account/passkeys">{t("passkeys")}</RouterLink>
      </Link>
      <Card asChild>
        <ActionForm action={changePasswordAction} className="form-grid">
          {params.changed ? (
            <Callout.Root color="green" role="status">
              <Callout.Text>{t("passwordChanged")}</Callout.Text>
            </Callout.Root>
          ) : null}
          {params.error ? (
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
            />
          </Text>
          <Text as="label" size="2" weight="medium" className="field-label">
            {t("newPassword")}
            <TextField.Root
              autoComplete="new-password"
              minLength={8}
              name="newPassword"
              required
              type="password"
            />
          </Text>
          <Text as="label" size="2" weight="medium" className="field-label">
            {t("confirmPassword")}
            <TextField.Root
              autoComplete="new-password"
              minLength={8}
              name="confirmPassword"
              required
              type="password"
            />
          </Text>
          <Button highContrast type="submit">
            {t("changePassword")}
          </Button>
        </ActionForm>
      </Card>
    </section>
  );
}
