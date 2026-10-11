"use client";

import { Button } from "@radix-ui/themes";
import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  ...props
}: Omit<ComponentProps<typeof Button>, "type" | "asChild">) {
  const { pending } = useFormStatus();
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
