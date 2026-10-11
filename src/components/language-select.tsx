"use client";

import { Select, Text } from "@radix-ui/themes";
import { useState, useTransition } from "react";
import { setLocaleAction } from "@/app/actions/locale";
import { type Locale, languageOptions } from "@/lib/locales";

export function LanguageSelect({
  locale,
  label,
  errorMessage,
}: {
  locale: Locale;
  label: string;
  errorMessage: string;
}) {
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  return (
    <div>
      <Select.Root
        value={locale}
        disabled={pending}
        onValueChange={(value) => {
          setFailed(false);
          startTransition(async () => {
            try {
              if (!(await setLocaleAction(value))) setFailed(true);
            } catch {
              setFailed(true);
            }
          });
        }}
      >
        <Select.Trigger aria-label={label} />
        <Select.Content position="popper">
          {languageOptions.map((option) => (
            <Select.Item key={option.locale} value={option.locale}>
              {option.label}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
      {failed ? (
        <Text as="p" size="1" color="red" role="alert">
          {errorMessage}
        </Text>
      ) : null}
    </div>
  );
}
