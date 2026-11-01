import { Button, Callout, Text, TextField } from "@radix-ui/themes";
import { loginAction } from "@/api/actions";
import { useSearch } from "@/api/views";
import { ActionForm } from "@/components/action-form";
import { AuthLayout } from "@/components/auth-layout";
import { PasskeyForm } from "@/components/passkey-form";
import { useDictionary } from "@/lib/i18n";

export default function LoginPage() {
  const t = useDictionary();
  const params = useSearch();
  return (
    <AuthLayout
      eyebrow={t("authLoginEyebrow")}
      title={t("loginTitle")}
      description={t("authLoginDescription")}
    >
      <ActionForm action={loginAction} className="form-grid auth-form">
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
      <div className="auth-divider">
        <span>{t("authOr")}</span>
      </div>
      <div className="auth-passkey">
        <PasskeyForm mode="authenticate" />
      </div>
    </AuthLayout>
  );
}
