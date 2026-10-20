import { Button, Card, Heading, Link, Text } from "@radix-ui/themes";
import { Link as RouterLink } from "react-router-dom";
import { deletePasskey } from "@/api/actions";
import { usePageView } from "@/api/views";
import { ActionForm } from "@/components/action-form";
import { PasskeyForm } from "@/components/passkey-form";
import { useDictionary } from "@/lib/i18n";

export default function PasskeysPage() {
  const { passkeys } = usePageView("passkeys");
  const t = useDictionary();
  return (
    <section className="narrow stack">
      <Heading as="h1" size="8">
        {t("passkeys")}
      </Heading>
      <Text as="p">{t("passkeyHelp")}</Text>
      <Link highContrast asChild>
        <RouterLink to="/account/password">{t("changePassword")}</RouterLink>
      </Link>
      <PasskeyForm
        mode="register"
        labels={{
          button: t("addPasskey"),
          error: t("passkeyError"),
          name: t("passkeyName"),
          password: t("currentPassword"),
          success: t("passkeyAdded"),
        }}
      />
      {passkeys.length ? (
        passkeys.map((passkey) => (
          <Card key={passkey.id}>
            <ActionForm action={deletePasskey} className="form-grid">
              <Text weight="medium">{passkey.name}</Text>
              <input type="hidden" name="id" value={passkey.id} />
              <Button
                highContrast
                color="red"
                type="submit"
                aria-label={`${t("delete")}: ${passkey.name}`}
              >
                {t("delete")}
              </Button>
            </ActionForm>
          </Card>
        ))
      ) : (
        <Text as="p">{t("noPasskeys")}</Text>
      )}
    </section>
  );
}
