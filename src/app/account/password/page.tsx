import {
  Button,
  Callout,
  Card,
  Heading,
  Text,
  TextField,
} from "@radix-ui/themes";
import { changePasswordAction } from "@/app/actions/auth";
import { requireUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";

export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ changed?: string; error?: string }>;
}) {
  await requireUser();
  const t = await getDictionary();
  const params = await searchParams;

  return (
    <section className="narrow stack">
      <div className="page-header">
        <div>
          <Heading as="h1" size="8">
            {t("changePassword")}
          </Heading>
        </div>
      </div>
      <Card asChild>
        <form action={changePasswordAction} className="form-grid">
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
        </form>
      </Card>
    </section>
  );
}
