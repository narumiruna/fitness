import {
  Button,
  Callout,
  Card,
  Heading,
  Text,
  TextField,
} from "@radix-ui/themes";
import { loginAction } from "@/api/actions";
import { useSearch } from "@/api/views";
import { ActionForm } from "@/components/action-form";
import { PasskeyForm } from "@/components/passkey-form";
import { useDictionary } from "@/lib/i18n";

export default function LoginPage() {
  const t = useDictionary();
  const params = useSearch();
  return (
    <section className="narrow stack">
      <div className="page-header">
        <div>
          <Heading as="h1" size="8">
            {t("loginTitle")}
          </Heading>
        </div>
      </div>
      <Card asChild>
        <ActionForm action={loginAction} className="form-grid">
          {params.error ? (
            <Callout.Root color="red" role="alert">
              <Callout.Text>{t("loginError")}</Callout.Text>
            </Callout.Root>
          ) : null}
          <Text as="label" size="2" weight="medium" className="field-label">
            {t("username")}
            <TextField.Root autoComplete="username" name="username" required />
          </Text>
          <Text as="label" size="2" weight="medium" className="field-label">
            {t("password")}
            <TextField.Root
              autoComplete="current-password"
              name="password"
              required
              type="password"
            />
          </Text>
          <Button highContrast type="submit">
            {t("signIn")}
          </Button>
        </ActionForm>
      </Card>
      <PasskeyForm mode="authenticate" />
    </section>
  );
}
