"use client";

import { Button, Card, Text } from "@radix-ui/themes";
export function PageError({
  onRetry,
  message,
  retry,
}: {
  onRetry: () => void;
  message: string;
  retry: string;
}) {
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
