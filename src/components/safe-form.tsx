"use client";
import { Button, Text } from "@radix-ui/themes";
import { unstable_rethrow, useRouter } from "next/navigation";
import { type ReactNode, useRef, useState, useTransition } from "react";
import type { FormErrorCode, FormFailure } from "@/lib/form-outcome";

// Submit in a transition, without React's automatic reset of uncontrolled drafts.
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
  action: (data: FormData) => Promise<void> | Promise<FormFailure | undefined>;
  children: ReactNode;
  error: string;
  success: string;
  className?: string;
  errors?: Partial<Record<FormErrorCode, string>>;
  onSuccess?: () => void;
  onPendingChange?: (pending: boolean) => void;
  refreshLabel?: string;
}) {
  const router = useRouter();
  const [conflict, setConflict] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);
  return (
    <form
      // Preserve the Server Action reference for progressive enhancement.
      // React ignores its return value; the hydrated submit handler reads it.
      action={action as (data: FormData) => Promise<void>}
      aria-busy={pending}
      className={className ?? "form-grid"}
      onSubmit={(event) => {
        event.preventDefault();
        if (inFlight.current) return;
        const data = new FormData(
          event.currentTarget,
          (event.nativeEvent as SubmitEvent).submitter,
        );
        inFlight.current = true;
        setMessage("");
        setConflict(false);
        onPendingChange?.(true);
        startTransition(async () => {
          try {
            const result = await action(data);
            if (result) {
              setMessage(errors?.[result.error] ?? error);
              setConflict(result.error === "sessionConflict");
            } else {
              setMessage(success);
              onSuccess?.();
            }
          } catch (caught) {
            unstable_rethrow(caught);
            setMessage(error);
          } finally {
            inFlight.current = false;
            onPendingChange?.(false);
          }
        });
      }}
    >
      <fieldset
        disabled={pending}
        style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
        className="form-grid"
      >
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
          onClick={() => router.refresh()}
        >
          {refreshLabel}
        </Button>
      ) : null}
    </form>
  );
}
