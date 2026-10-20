import { Button } from "@radix-ui/themes";
import type { ComponentProps } from "react";
import { useFormPending } from "./action-form";

export function SubmitButton({
  children,
  ...props
}: Omit<ComponentProps<typeof Button>, "type" | "asChild">) {
  const pending = useFormPending();
  return (
    <Button
      highContrast
      {...props}
      type="submit"
      disabled={pending || props.disabled}
      loading={pending}
      aria-busy={pending}
      aria-label={
        props["aria-label"] ??
        (typeof children === "string" ? children : undefined)
      }
    >
      {children}
    </Button>
  );
}
