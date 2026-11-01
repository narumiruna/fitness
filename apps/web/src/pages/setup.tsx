import { Button, Text, TextField } from "@radix-ui/themes";
import { setupAdminAction } from "@/api/actions";
import { ActionForm } from "@/components/action-form";
import { AuthLayout } from "@/components/auth-layout";
import { useDictionary } from "@/lib/i18n";

export default function SetupPage() {
  const t = useDictionary();
  return (
    <AuthLayout
      eyebrow={t("authSetupEyebrow")}
      title={t("setupTitle")}
      description={t("setupContext")}
    >
      <ActionForm action={setupAdminAction} className="form-grid auth-form">
        <Text as="label" size="2" weight="medium" className="field-label">
          {t("username")}
          <TextField.Root autoComplete="username" name="username" required />
        </Text>
        <Text as="label" size="2" weight="medium" className="field-label">
          {t("password")}
          <TextField.Root
            autoComplete="new-password"
            name="password"
            required
            type="password"
          />
        </Text>
        <Button highContrast type="submit">
          {t("createAdmin")}
        </Button>
      </ActionForm>
    </AuthLayout>
  );
}
