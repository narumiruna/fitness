"use client";

import { AlertDialog, Button, Flex } from "@radix-ui/themes";
import { useState } from "react";
import { SubmitButton } from "@/components/submit-button";

export function ConfirmDelete({
  action,
  fields,
  title,
  description,
  cancel,
  confirm,
}: {
  action: (data: FormData) => void | Promise<void>;
  fields: Record<string, string>;
  title: string;
  description: string;
  cancel: string;
  confirm: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!pending) setOpen(value);
      }}
    >
      <AlertDialog.Trigger>
        <Button highContrast color="red" variant="ghost" disabled={pending}>
          {confirm}
        </Button>
      </AlertDialog.Trigger>
      <AlertDialog.Content maxWidth="420px">
        <AlertDialog.Title>{title}</AlertDialog.Title>
        <AlertDialog.Description>{description}</AlertDialog.Description>
        <Flex gap="3" justify="end" mt="4">
          <AlertDialog.Cancel>
            <Button highContrast variant="soft" color="gray" disabled={pending}>
              {cancel}
            </Button>
          </AlertDialog.Cancel>
          <form
            action={async (data) => {
              setPending(true);
              try {
                await action(data);
                setOpen(false);
              } finally {
                setPending(false);
              }
            }}
          >
            {Object.entries(fields).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            <SubmitButton color="red">{confirm}</SubmitButton>
          </form>
        </Flex>
      </AlertDialog.Content>
    </AlertDialog.Root>
  );
}
