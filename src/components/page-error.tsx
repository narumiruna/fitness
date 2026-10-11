"use client";

import { Button, Card, Text } from "@radix-ui/themes";
import { createContext, type ReactNode, useContext } from "react";

type ErrorMessages = { message: string; retry: string };
const ErrorMessagesContext = createContext<ErrorMessages | undefined>(
  undefined,
);

export function PageErrorMessagesProvider({
  children,
  message,
  retry,
}: ErrorMessages & { children?: ReactNode }) {
  return (
    <ErrorMessagesContext.Provider value={{ message, retry }}>
      {children}
    </ErrorMessagesContext.Provider>
  );
}

export function PageError({ onRetry }: { onRetry: () => void }) {
  const messages = useContext(ErrorMessagesContext);
  if (!messages)
    throw new Error("PageError requires PageErrorMessagesProvider.");
  const { message, retry } = messages;
  return (
    <Card>
      <Text as="p" role="alert">
        {message}
      </Text>
      <Button highContrast onClick={onRetry} mt="4">
        {retry}
      </Button>
    </Card>
  );
}
