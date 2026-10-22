import { Button, Callout, Card, Text, TextField } from "@radix-ui/themes";
import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import { useRef, useState, useTransition } from "react";
import { useNavigate } from "react-router-dom";
import {
  authenticatePasskey,
  passkeyAuthenticationOptions,
  passkeyRegistrationOptions,
  registerPasskey,
} from "@/api/actions";
import { refreshViews } from "@/api/client";
import { type MessageKey, useDictionary } from "@/lib/i18n";

export function PasskeyForm({ mode }: { mode: "register" | "authenticate" }) {
  const navigate = useNavigate();
  const t = useDictionary();
  const inFlight = useRef(false);
  const supported = window.isSecureContext && browserSupportsWebAuthn();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<
    "error" | "incomplete" | "unsupported" | "success" | null
  >(null);
  const outcome = supported ? status : "unsupported";
  const feedback: Record<"error" | "incomplete" | "unsupported", MessageKey> =
    mode === "register"
      ? {
          error: "passkeyRegisterError",
          incomplete: "passkeyRegisterIncomplete",
          unsupported: "passkeyRegisterUnsupported",
        }
      : {
          error: "passkeyAuthenticateError",
          incomplete: "passkeyAuthenticateIncomplete",
          unsupported: "passkeyAuthenticateUnsupported",
        };
  return (
    <Card asChild>
      <form
        className="form-grid"
        aria-busy={pending}
        onSubmit={(event) => {
          event.preventDefault();
          if (inFlight.current || !supported) return;
          inFlight.current = true;
          const form = event.currentTarget;
          const data = new FormData(form);
          setStatus(null);
          startTransition(async () => {
            try {
              if (mode === "register") {
                const name = String(data.get("name"));
                const options = await passkeyRegistrationOptions(
                  String(data.get("password")),
                  name,
                );
                const response = await startRegistration({
                  optionsJSON: options,
                });
                if (!(await registerPasskey(response, name))) throw new Error();
                form.reset();
                setStatus("success");
                await refreshViews();
              } else {
                const options = await passkeyAuthenticationOptions();
                const response = await startAuthentication({
                  optionsJSON: options,
                });
                if (!(await authenticatePasskey(response))) throw new Error();
                navigate("/workouts");
                await refreshViews();
              }
            } catch (error) {
              // SimpleWebAuthn can wrap the browser's DOMException in Error.cause.
              const cause =
                error instanceof Error && error.cause instanceof Error
                  ? error.cause
                  : error;
              setStatus(
                cause instanceof Error && cause.name === "NotSupportedError"
                  ? "unsupported"
                  : cause instanceof Error &&
                      (cause.name === "NotAllowedError" ||
                        cause.name === "AbortError")
                    ? "incomplete"
                    : "error",
              );
            } finally {
              inFlight.current = false;
            }
          });
        }}
      >
        {outcome ? (
          <Callout.Root
            color={outcome === "success" ? "green" : "red"}
            role={outcome === "success" ? "status" : "alert"}
          >
            <Callout.Text>
              {outcome === "success" ? t("passkeyAdded") : t(feedback[outcome])}
            </Callout.Text>
          </Callout.Root>
        ) : null}
        {mode === "register" ? (
          <>
            <Text as="label" size="2" weight="medium" className="field-label">
              {t("passkeyName")}
              <TextField.Root
                name="name"
                required
                maxLength={80}
                disabled={pending}
              />
            </Text>
            <Text as="label" size="2" weight="medium" className="field-label">
              {t("currentPassword")}
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
        <Button
          highContrast
          variant={mode === "authenticate" ? "soft" : "solid"}
          type="submit"
          loading={pending}
          disabled={!supported || pending}
          aria-label={t(mode === "register" ? "addPasskey" : "passkeySignIn")}
        >
          {t(mode === "register" ? "addPasskey" : "passkeySignIn")}
        </Button>
      </form>
    </Card>
  );
}
