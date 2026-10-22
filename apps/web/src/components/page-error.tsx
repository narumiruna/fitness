import { Button, Card, Heading, Link, Text } from "@radix-ui/themes";
import { createContext, type ReactNode, useContext, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { useDictionary } from "@/lib/i18n";
import { useSession } from "@/lib/session";

type ErrorMessages = { message: string; retry: string; title?: string };
const ErrorMessagesContext = createContext<ErrorMessages | undefined>(
  undefined,
);

export function PageErrorMessagesProvider({
  children,
  message,
  retry,
  title,
}: ErrorMessages & { children?: ReactNode }) {
  return (
    <ErrorMessagesContext.Provider value={{ message, retry, title }}>
      {children}
    </ErrorMessagesContext.Provider>
  );
}

export function PageUnavailable({
  forbidden = false,
}: {
  forbidden?: boolean;
}) {
  const t = useDictionary();
  const { user } = useSession();
  return (
    <section className="narrow stack">
      <Heading as="h1" size="8">
        {t(forbidden ? "accessDeniedTitle" : "missingPageTitle")}
      </Heading>
      <Text as="p" role="alert">
        {t(forbidden ? "accessDenied" : "missingPage")}
      </Text>
      <Link highContrast asChild>
        <RouterLink to={user ? "/workouts" : "/login"}>
          {t(user ? "backToWorkouts" : "signIn")}
        </RouterLink>
      </Link>
    </section>
  );
}

export function PageError({
  onRetry,
}: {
  onRetry: () => void | Promise<void>;
}) {
  const messages = useContext(ErrorMessagesContext);
  const [pending, setPending] = useState(false);
  if (!messages)
    throw new Error("PageError requires PageErrorMessagesProvider.");
  const { message, retry, title } = messages;
  return (
    <Card aria-busy={pending}>
      {title ? (
        <Heading as="h1" size="8" mb="4">
          {title}
        </Heading>
      ) : null}
      <Text as="p" role="alert">
        {message}
      </Text>
      <Button
        highContrast
        loading={pending}
        aria-label={retry}
        onClick={async () => {
          if (pending) return;
          setPending(true);
          try {
            await onRetry();
          } finally {
            setPending(false);
          }
        }}
        mt="4"
      >
        {retry}
      </Button>
    </Card>
  );
}
