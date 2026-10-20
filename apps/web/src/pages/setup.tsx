import { Button, Card, Heading, Text, TextField } from "@radix-ui/themes";
import { setupAdminAction } from "@/api/actions";
import { ActionForm } from "@/components/action-form";
import { useDictionary } from "@/lib/i18n";

export default function SetupPage() {
  const t = useDictionary();
  return (
    <section className="narrow stack">
      <div className="page-header">
        <div>
          <Heading as="h1" size="8">
            {t("setupTitle")}
          </Heading>
          <Text as="p" size="2" color="gray">
            {t("setupIntro")}
          </Text>
        </div>
      </div>
      <Card asChild>
        <ActionForm action={setupAdminAction} className="form-grid">
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
      </Card>
    </section>
  );
}
