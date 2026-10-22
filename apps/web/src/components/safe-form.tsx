import { Button, Text } from "@radix-ui/themes";
import { type ReactNode, useRef, useState } from "react";
import type { FormAction, FormErrorCode } from "@/api/actions";
import { HttpError, refreshViews } from "@/api/client";
import { FormPendingContext } from "./action-form";
import { revealDisclosures } from "./form-disclosure";

export function SafeForm({
  action,
  children,
  error,
  success,
  className,
  errors,
  onSuccess,
  onPendingChange,
  refreshLabel,
}: {
  action: FormAction;
  children: ReactNode;
  error: string;
  success: string;
  className?: string;
  errors?: Partial<Record<FormErrorCode, string>>;
  onSuccess?: () => void;
  onPendingChange?: (pending: boolean) => void;
  refreshLabel?: string;
}) {
  const [conflict, setConflict] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  return (
    <FormPendingContext.Provider value={pending}>
      <form
        aria-busy={pending}
        className={className ?? "form-grid"}
        onInvalidCapture={(event) => {
          if (event.target instanceof HTMLElement)
            revealDisclosures(event.target);
        }}
        onSubmit={async (event) => {
          event.preventDefault();
          if (inFlight.current) return;
          const form = event.currentTarget;
          const data = new FormData(
            form,
            (event.nativeEvent as SubmitEvent).submitter,
          );
          inFlight.current = true;
          setPending(true);
          setMessage("");
          setConflict(false);
          onPendingChange?.(true);
          try {
            const result = await action(data);
            if (result) {
              revealDisclosures(form);
              setMessage(errors?.[result.error] ?? error);
              setConflict(result.error === "sessionConflict");
            } else {
              setMessage(success);
              onSuccess?.();
            }
          } catch (caught) {
            revealDisclosures(form);
            setMessage(
              caught instanceof HttpError && caught.status === 409
                ? (errors?.sessionConflict ?? error)
                : error,
            );
            setConflict(caught instanceof HttpError && caught.status === 409);
          } finally {
            inFlight.current = false;
            setPending(false);
            onPendingChange?.(false);
          }
        }}
      >
        <fieldset disabled={pending} className="form-grid form-fields">
          {children}
        </fieldset>
        <Text size="2" role="status">
          {message}
        </Text>
        {conflict && refreshLabel ? (
          <Button
            type="button"
            variant="soft"
            disabled={pending}
            onClick={() => {
              void refreshViews();
            }}
          >
            {refreshLabel}
          </Button>
        ) : null}
      </form>
    </FormPendingContext.Provider>
  );
}
