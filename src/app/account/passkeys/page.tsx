import { Button, Card, Heading, Link, Text } from "@radix-ui/themes";
import NextLink from "next/link";
import { deletePasskey } from "@/app/actions/passkeys";
import { PasskeyForm } from "@/components/passkey-form";
import { requireUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";

export default async function PasskeysPage() {
  const user = await requireUser();
  const t = await getDictionary();
  const passkeys = await prisma.passkey.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  return (
    <section className="narrow stack">
      <Heading as="h1" size="8">
        {t("passkeys")}
      </Heading>
      <Text as="p">{t("passkeyHelp")}</Text>
      <Link highContrast asChild>
        <NextLink href="/account/password">{t("changePassword")}</NextLink>
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
            <form action={deletePasskey} className="form-grid">
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
            </form>
          </Card>
        ))
      ) : (
        <Text as="p">{t("noPasskeys")}</Text>
      )}
    </section>
  );
}
