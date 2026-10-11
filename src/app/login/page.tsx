import {
  Button,
  Callout,
  Card,
  Heading,
  Text,
  TextField,
} from "@radix-ui/themes";
import { redirect } from "next/navigation";
import { loginAction } from "@/app/actions/auth";
import { getCurrentUser, hasUsers } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!(await hasUsers())) {
    redirect("/setup");
  }

  if (await getCurrentUser()) {
    redirect("/workouts");
  }

  const t = await getDictionary();
  const params = await searchParams;

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
        <form action={loginAction} className="form-grid">
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
        </form>
      </Card>
    </section>
  );
}
