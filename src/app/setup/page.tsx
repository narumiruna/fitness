import { Button, Card, Heading, Text, TextField } from "@radix-ui/themes";
import { redirect } from "next/navigation";
import { setupAdminAction } from "@/app/actions/auth";
import { hasUsers } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";

export default async function SetupPage() {
  if (await hasUsers()) {
    redirect("/login");
  }

  const t = await getDictionary();

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
        <form action={setupAdminAction} className="form-grid">
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
        </form>
      </Card>
    </section>
  );
}
