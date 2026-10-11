"use client";

import { Button, Callout, Card, Text, TextField } from "@radix-ui/themes";
import {
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  authenticatePasskey,
  passkeyAuthenticationOptions,
  passkeyRegistrationOptions,
  registerPasskey,
} from "@/app/actions/passkeys";

export function PasskeyForm({
  mode,
  labels,
}: {
  mode: "register" | "authenticate";
  labels: {
    button: string;
    error: string;
    name: string;
    password: string;
    success: string;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<"error" | "success" | null>(null);
  return (
    <Card asChild>
      <form
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          setStatus(null);
          startTransition(async () => {
            try {
              if (mode === "register") {
                const options = await passkeyRegistrationOptions(
                  String(data.get("password")),
                );
                const response = await startRegistration({
                  optionsJSON: options,
                });
                if (
                  !(await registerPasskey(response, String(data.get("name"))))
                )
                  throw new Error();
                form.reset();
                setStatus("success");
                router.refresh();
              } else {
                const options = await passkeyAuthenticationOptions();
                const response = await startAuthentication({
                  optionsJSON: options,
                });
                if (!(await authenticatePasskey(response))) throw new Error();
                router.push("/workouts");
                router.refresh();
              }
            } catch {
              setStatus("error");
            }
          });
        }}
      >
        {status ? (
          <Callout.Root
            color={status === "error" ? "red" : "green"}
            role={status === "error" ? "alert" : "status"}
          >
            <Callout.Text>
              {status === "error" ? labels.error : labels.success}
            </Callout.Text>
          </Callout.Root>
        ) : null}
        {mode === "register" ? (
          <>
            <Text as="label" size="2" weight="medium" className="field-label">
              {labels.name}
              <TextField.Root
                name="name"
                required
                maxLength={80}
                disabled={pending}
              />
            </Text>
            <Text as="label" size="2" weight="medium" className="field-label">
              {labels.password}
              <TextField.Root
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={256}
                disabled={pending}
              />
            </Text>
          </>
        ) : null}
        <Button highContrast type="submit" loading={pending}>
          {labels.button}
        </Button>
      </form>
    </Card>
  );
}
