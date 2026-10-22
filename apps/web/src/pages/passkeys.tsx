import { Card, Flex, Heading, Link, Text } from "@radix-ui/themes";
import { useRef, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { deletePasskey } from "@/api/actions";
import { usePageView } from "@/api/views";
import { ConfirmDelete } from "@/components/confirm-delete";
import { PasskeyForm } from "@/components/passkey-form";
import { useDictionary } from "@/lib/i18n";

export default function PasskeysPage() {
  const { passkeys } = usePageView("passkeys");
  const t = useDictionary();
  const passwordRecoveryRef = useRef<HTMLAnchorElement>(null);
  const [removed, setRemoved] = useState("");
  return (
    <section className="narrow stack">
      <Heading as="h1" size="8">
        {t("passkeys")}
      </Heading>
      <Text as="p">{t("passkeyHelp")}</Text>
      <Flex asChild gap="4" wrap="wrap">
        <nav aria-label={t("accountSecurity")}>
          <Link highContrast asChild>
            <RouterLink ref={passwordRecoveryRef} to="/account/password">
              {t("changePassword")}
            </RouterLink>
          </Link>
          <Link highContrast asChild weight="bold">
            <RouterLink to="/account/passkeys" aria-current="page">
              {t("passkeys")}
            </RouterLink>
          </Link>
        </nav>
      </Flex>
      <Link highContrast asChild>
        <RouterLink to="/account/connections">{t("mcpConnections")}</RouterLink>
      </Link>
      <PasskeyForm mode="register" />
      {removed ? (
        <Text as="p" role="status">
          {t("passkeyDeleted").replace("{name}", removed)}
        </Text>
      ) : null}
      {passkeys.length ? (
        passkeys.map((passkey) => (
          <Card key={passkey.id} className="stack">
            <Text weight="medium">{passkey.name}</Text>
            <ConfirmDelete
              action={async (data) => {
                const result = await deletePasskey(data);
                if (!result) setRemoved(passkey.name);
                return result;
              }}
              fields={{ id: passkey.id }}
              title={t("deletePasskeyTitle").replace("{name}", passkey.name)}
              description={t("deletePasskeyDescription")}
              cancel={t("cancel")}
              confirm={t("delete")}
              triggerLabel={`${t("delete")}: ${passkey.name}`}
              failureMessage={t("deletePasskeyFailed")}
              fallbackFocusRef={passwordRecoveryRef}
            />
          </Card>
        ))
      ) : (
        <Text as="p">{t("noPasskeys")}</Text>
      )}
    </section>
  );
}
