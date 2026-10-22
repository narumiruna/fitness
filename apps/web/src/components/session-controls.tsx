import { AlertDialog, Button, Flex } from "@radix-ui/themes";
import { useState } from "react";
import type { FormErrorCode } from "@/api/actions";
import { changeSessionAction } from "@/api/actions";
import { SafeForm } from "./safe-form";

export type SessionMessages = {
  pause: string;
  resume: string;
  finish: string;
  abandon: string;
  cancel: string;
  finishSkipped: string;
  skippedDescription: string;
  abandonDescription: string;
  saved: string;
  saveFailed: string;
  refresh: string;
  errors: Partial<Record<FormErrorCode, string>>;
};

export function SessionControls({
  workoutId,
  version,
  active,
  skipped,
  messages,
}: {
  workoutId: string;
  version: number;
  active: boolean;
  skipped: number;
  messages: SessionMessages;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="card-actions">
      <SafeForm
        action={changeSessionAction}
        error={messages.saveFailed}
        success={messages.saved}
        errors={messages.errors}
        refreshLabel={messages.refresh}
        onPendingChange={setBusy}
      >
        <input type="hidden" name="workoutId" value={workoutId} />
        <input type="hidden" name="version" value={version} />
        <div className="card-actions">
          <Button
            highContrast
            name="command"
            value={active ? "pause" : "resume"}
            variant={active ? "soft" : "solid"}
            type="submit"
          >
            {active ? messages.pause : messages.resume}
          </Button>
          {skipped === 0 ? (
            <Button
              highContrast
              name="command"
              value="finish"
              variant={active ? "solid" : "soft"}
              type="submit"
            >
              {messages.finish}
            </Button>
          ) : null}
        </div>
      </SafeForm>
      {skipped > 0 ? (
        <SessionConfirmation
          workoutId={workoutId}
          version={version}
          command="finish"
          skipped={skipped}
          messages={messages}
          disabled={busy}
        />
      ) : null}
      <SessionConfirmation
        workoutId={workoutId}
        version={version}
        command="abandon"
        skipped={skipped}
        messages={messages}
        disabled={busy}
      />
    </div>
  );
}

function SessionConfirmation({
  workoutId,
  version,
  command,
  skipped,
  messages,
  disabled,
}: {
  workoutId: string;
  version: number;
  disabled: boolean;
  command: "finish" | "abandon";
  skipped: number;
  messages: SessionMessages;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  // Bind confirmation to the state the user actually reviewed, not newer props.
  const [reviewed, setReviewed] = useState({ version, skipped });
  const abandon = command === "abandon";
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(value) => {
        if (pending) return;
        if (value) setReviewed({ version, skipped });
        setOpen(value);
      }}
    >
      <AlertDialog.Trigger>
        <Button
          highContrast
          type="button"
          disabled={disabled}
          color={abandon ? "red" : undefined}
          variant="soft"
        >
          {abandon ? messages.abandon : messages.finish}
        </Button>
      </AlertDialog.Trigger>
      <AlertDialog.Content maxWidth="420px">
        <AlertDialog.Title>
          {abandon ? messages.abandon : messages.finishSkipped}
        </AlertDialog.Title>
        <AlertDialog.Description>
          {abandon
            ? messages.abandonDescription
            : messages.skippedDescription.replace(
                "{count}",
                String(reviewed.skipped),
              )}
        </AlertDialog.Description>
        <Flex direction="column" gap="3" mt="4">
          <SafeForm
            action={changeSessionAction}
            error={messages.saveFailed}
            success={messages.saved}
            errors={messages.errors}
            refreshLabel={messages.refresh}
            onPendingChange={setPending}
            onSuccess={() => setOpen(false)}
          >
            <input type="hidden" name="workoutId" value={workoutId} />
            <input type="hidden" name="version" value={reviewed.version} />
            <input type="hidden" name="command" value={command} />
            <input type="hidden" name="partial" value={abandon ? "" : "on"} />
            <Button
              highContrast
              type="submit"
              color={abandon ? "red" : undefined}
            >
              {abandon ? messages.abandon : messages.finishSkipped}
            </Button>
          </SafeForm>
          <AlertDialog.Cancel>
            <Button
              highContrast
              type="button"
              variant="soft"
              color="gray"
              disabled={pending}
            >
              {messages.cancel}
            </Button>
          </AlertDialog.Cancel>
        </Flex>
      </AlertDialog.Content>
    </AlertDialog.Root>
  );
}
