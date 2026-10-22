import {
  mcpAuthorizationSchema,
  mcpDecisionSchema,
} from "@narumitw/fitness-contracts";
import {
  Button,
  Callout,
  Card,
  Flex,
  Heading,
  Link,
  Spinner,
  Text,
} from "@radix-ui/themes";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link as RouterLink, useSearchParams } from "react-router-dom";
import { request } from "@/api/client";
import { useDictionary } from "@/lib/i18n";
import { useSession } from "@/lib/session";

export default function McpConsentPage() {
  const [params] = useSearchParams();
  const ids = params.getAll("request");
  const requestId =
    ids.length === 1 && /^[A-Za-z0-9_-]{16,128}$/.test(ids[0] ?? "")
      ? ids[0]
      : null;
  return <ConsentRequest key={requestId} requestId={requestId ?? null} />;
}

function ConsentRequest({ requestId }: { requestId: string | null }) {
  const t = useDictionary();
  const { user } = useSession();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);
  const authorization = useQuery({
    queryKey: ["view", "mcp-authorization", requestId],
    queryFn: ({ signal }) =>
      request(
        `/api/mcp/authorization/${encodeURIComponent(requestId ?? "")}`,
        mcpAuthorizationSchema,
        { signal },
      ),
    enabled: Boolean(user && requestId),
  });

  async function decide(approved: boolean) {
    if (!requestId || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setFailed(false);
    try {
      const result = await request(
        `/api/mcp/authorization/${encodeURIComponent(requestId)}`,
        mcpDecisionSchema,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approved }),
        },
      );
      // The server validates the registered OAuth callback, including loopback URLs.
      window.location.assign(result.redirect);
    } catch {
      setFailed(true);
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <section className="narrow stack" aria-busy={pending}>
      <Heading as="h1" size="8">
        {t("mcpConsentTitle")}
      </Heading>
      {!requestId ? (
        <Text role="alert">{t("mcpConsentUnavailable")}</Text>
      ) : !user ? (
        <>
          <Text as="p">{t("mcpConsentSignIn")}</Text>
          <Button highContrast asChild>
            <RouterLink to="/login" state={{ mcpConsentRequest: requestId }}>
              {t("signIn")}
            </RouterLink>
          </Button>
        </>
      ) : authorization.isPending ? (
        <Text role="status">
          <Spinner /> {t("loading")}
        </Text>
      ) : authorization.isError ? (
        <>
          <Text role="alert">{t("mcpConsentUnavailable")}</Text>
          <Button onClick={() => void authorization.refetch()}>
            {t("tryAgain")}
          </Button>
        </>
      ) : (
        <Card className="stack">
          <Heading as="h2" size="5">
            {authorization.data.clientName}
          </Heading>
          <Text as="p" size="2" style={{ overflowWrap: "anywhere" }}>
            {t("mcpClientIdentity")}: {authorization.data.clientId}
          </Text>
          <Text as="p" size="2">
            {t("mcpVerifyClient")}
          </Text>
          <Text as="p">{t("mcpRequestedPermissions")}</Text>
          <ul>
            {authorization.data.scopes.map((scope) => (
              <li key={scope}>
                {t(scope === "fitness:read" ? "mcpReadScope" : "mcpWriteScope")}
              </li>
            ))}
          </ul>
          <Callout.Root color="amber">
            <Callout.Text>{t("mcpPrivacyWarning")}</Callout.Text>
          </Callout.Root>
          {failed ? <Text role="alert">{t("mcpConsentFailed")}</Text> : null}
          <Flex gap="3" wrap="wrap">
            <Button
              highContrast
              loading={pending}
              disabled={pending}
              onClick={() => void decide(true)}
            >
              {t("mcpAllow")}
            </Button>
            <Button
              highContrast
              variant="soft"
              disabled={pending}
              onClick={() => void decide(false)}
            >
              {t("mcpDeny")}
            </Button>
          </Flex>
        </Card>
      )}
      <Link highContrast asChild>
        <RouterLink to="/source">{t("sourceLicense")}</RouterLink>
      </Link>
    </section>
  );
}
