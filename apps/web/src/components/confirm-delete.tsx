import { AlertDialog, Button, Flex, Text } from "@radix-ui/themes";
import { type RefObject, useEffect, useRef, useState } from "react";
import type { FormAction } from "@/api/actions";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";

export function ConfirmDelete({
  action,
  fields,
  title,
  description,
  cancel,
  confirm,
  triggerLabel,
  failureMessage,
  fallbackFocusRef,
}: {
  action: FormAction;
  fields: Record<string, string>;
  title: string;
  description: string;
  cancel: string;
  confirm: string;
  triggerLabel?: string;
  failureMessage?: string;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!pending) {
          if (value) setFailed(false);
          setOpen(value);
        }
      }}
    >
      <AlertDialog.Trigger>
        <Button
          ref={triggerRef}
          highContrast
          color="red"
          variant="ghost"
          disabled={pending}
          aria-label={triggerLabel}
        >
          {confirm}
        </Button>
      </AlertDialog.Trigger>
      <AlertDialog.Content
        maxWidth="420px"
        onCloseAutoFocus={(event) => {
          // A successful removal can unmount the trigger before the action returns.
          // Let Radix restore it on cancel; use the surviving control only if needed.
          const fallback = fallbackFocusRef?.current;
          if (!triggerRef.current?.isConnected && fallback?.isConnected) {
            event.preventDefault();
            fallback.focus();
          }
        }}
      >
        <AlertDialog.Title>{title}</AlertDialog.Title>
        <AlertDialog.Description>{description}</AlertDialog.Description>
        {failed ? (
          <Text as="p" role="alert" color="red" mt="3">
            {failureMessage}
          </Text>
        ) : null}
        <Flex gap="3" justify="end" mt="4">
          <AlertDialog.Cancel>
            <Button highContrast variant="soft" color="gray" disabled={pending}>
              {cancel}
            </Button>
          </AlertDialog.Cancel>
          <ActionForm
            action={async (data) => {
              setPending(true);
              setFailed(false);
              try {
                const result = await action(data);
                if (!result && mounted.current) setOpen(false);
                return result;
              } catch (error) {
                if (!failureMessage) throw error;
                if (mounted.current) setFailed(true);
              } finally {
                if (mounted.current) setPending(false);
              }
            }}
          >
            {Object.entries(fields).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            <SubmitButton color="red">{confirm}</SubmitButton>
          </ActionForm>
        </Flex>
      </AlertDialog.Content>
    </AlertDialog.Root>
  );
}
