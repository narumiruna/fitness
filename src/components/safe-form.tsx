"use client";
import { Text } from "@radix-ui/themes";
import { type ReactNode, useRef, useState, useTransition } from "react";

// Submit in a transition, without React's automatic reset of uncontrolled drafts.
export function SafeForm({
  action,
  children,
  error,
  success,
  className,
}: {
  action: (data: FormData) => Promise<void>;
  children: ReactNode;
  error: string;
  success: string;
  className?: string;
}) {
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);
  return (
    <form
      action={action}
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
        startTransition(async () => {
          try {
            await action(data);
            setMessage(success);
          } catch {
            setMessage(error);
          } finally {
            inFlight.current = false;
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
    </form>
  );
}
