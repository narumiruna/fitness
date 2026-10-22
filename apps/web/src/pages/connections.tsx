import {
  mcpConnectionsSchema,
  mcpRevokedSchema,
} from "@narumitw/fitness-contracts";
import {
  AlertDialog,
  Button,
  Card,
  Flex,
  Heading,
  Link,
  Spinner,
  Text,
} from "@radix-ui/themes";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { request } from "@/api/client";
import { useDictionary } from "@/lib/i18n";
import { useSession } from "@/lib/session";

export default function ConnectionsPage() {
  const t = useDictionary();
  const { locale } = useSession();
  const [pending, setPending] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const inFlight = useRef(false);
  const connections = useQuery({
    queryKey: ["view", "mcp-connections"],
    queryFn: ({ signal }) =>
      request("/api/mcp/connections", mcpConnectionsSchema, { signal }),
  });

  async function revoke(id: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(id);
    setFailed(false);
    setRevoked(false);
    try {
      await request(
        `/api/mcp/connections/${encodeURIComponent(id)}/revoke`,
        mcpRevokedSchema,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );
      setRevoked(true);
      await connections.refetch();
    } catch {
      setFailed(true);
    } finally {
      inFlight.current = false;
      setPending(null);
    }
  }

  return (
    <section className="narrow stack" aria-busy={pending !== null}>
      <Heading as="h1" size="8">
        {t("mcpConnections")}
      </Heading>
      <Text as="p">{t("mcpConnectionsHelp")}</Text>
      <Link highContrast asChild>
        <RouterLink to="/account/password">{t("account")}</RouterLink>
      </Link>
      {failed ? <Text role="alert">{t("mcpRevokeFailed")}</Text> : null}
      {revoked ? <Text role="status">{t("mcpRevoked")}</Text> : null}
      {connections.isPending ? (
        <Text role="status">
          <Spinner /> {t("loading")}
        </Text>
      ) : connections.isError ? (
        <>
          <Text role="alert">{t("pageError")}</Text>
          <Button onClick={() => void connections.refetch()}>
            {t("tryAgain")}
          </Button>
        </>
      ) : connections.data.connections.length === 0 ? (
        <Text as="p">{t("mcpNoConnections")}</Text>
      ) : (
        connections.data.connections.map((connection) => (
          <Card key={connection.id} className="stack">
            <Heading as="h2" size="5">
              {connection.clientName}
            </Heading>
            <Text as="p" size="2" style={{ overflowWrap: "anywhere" }}>
              {t("mcpClientIdentity")}: {connection.clientId}
            </Text>
            <ul>
              {connection.scopes.map((scope) => (
                <li key={scope}>
                  {t(
                    scope === "fitness:read" ? "mcpReadScope" : "mcpWriteScope",
                  )}
                </li>
              ))}
            </ul>
            <Text as="p" size="2">
              {t("mcpConnectedAt")}:{" "}
              <time dateTime={connection.createdAt}>
                {new Date(connection.createdAt).toLocaleString(locale)}
              </time>
            </Text>
            <Text as="p" size="2">
              {t("mcpExpiresAt")}:{" "}
              <time dateTime={connection.expiresAt}>
                {new Date(connection.expiresAt).toLocaleString(locale)}
              </time>
            </Text>
            <AlertDialog.Root>
              <AlertDialog.Trigger>
                <Button
                  highContrast
                  color="red"
                  variant="soft"
                  disabled={pending !== null}
                  loading={pending === connection.id}
                >
                  {t("mcpRevoke")}
                </Button>
              </AlertDialog.Trigger>
              <AlertDialog.Content maxWidth="450px">
                <AlertDialog.Title>{t("mcpRevokeTitle")}</AlertDialog.Title>
                <AlertDialog.Description>
                  {t("mcpRevokeDescription").replace(
                    "{client}",
                    () => connection.clientName,
                  )}
                </AlertDialog.Description>
                <Flex gap="3" mt="4" justify="end">
                  <AlertDialog.Cancel>
                    <Button variant="soft">{t("cancel")}</Button>
                  </AlertDialog.Cancel>
                  <AlertDialog.Action>
                    <Button
                      highContrast
                      color="red"
                      onClick={() => void revoke(connection.id)}
                    >
                      {t("mcpRevoke")}
                    </Button>
                  </AlertDialog.Action>
                </Flex>
              </AlertDialog.Content>
            </AlertDialog.Root>
          </Card>
        ))
      )}
    </section>
  );
}
