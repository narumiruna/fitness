import { PlusIcon } from "@radix-ui/react-icons";
import { Button, Dialog, Select, Text, TextField } from "@radix-ui/themes";
import { useEffect, useRef, useState } from "react";
import { createExerciseOptionAction } from "@/api/actions";
import { useDictionary } from "@/lib/i18n";
import { ActionForm, useFormPending } from "./action-form";

export type ExerciseOption = { id: string; defaultName: string };

export function ExerciseSelect({
  exercises,
  value,
  defaultValue,
  onValueChange,
}: {
  exercises: ExerciseOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (id: string) => void;
}) {
  const t = useDictionary();
  const pending = useFormPending();
  const trigger = useRef<HTMLButtonElement>(null);
  const [selected, setSelected] = useState(
    defaultValue ?? exercises[0]?.id ?? "",
  );
  const select = (id: string) => {
    setSelected(id);
    onValueChange?.(id);
  };
  useEffect(() => {
    const form = trigger.current?.closest("form");
    // Clearing set inputs must not switch the exercise for the next set.
    const restoreSelection = () => {
      const id = value ?? selected;
      queueMicrotask(() => {
        setSelected(id);
        onValueChange?.(id);
      });
    };
    form?.addEventListener("reset", restoreSelection);
    return () => form?.removeEventListener("reset", restoreSelection);
  }, [value, selected, onValueChange]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<ExerciseOption | null>(null);
  const options =
    created && !exercises.some((exercise) => exercise.id === created.id)
      ? [...exercises, created]
      : exercises;
  return (
    <div className="exercise-select">
      <Select.Root
        name="exerciseId"
        value={value ?? selected}
        onValueChange={(id) => {
          if (id === "__create__") setOpen(true);
          // The hidden native select can emit an empty value when options change.
          else if (id) select(id);
        }}
        required
        disabled={pending || creating}
      >
        <Select.Trigger
          ref={trigger}
          aria-label={t("exercise")}
          placeholder={t("exercise")}
        />
        <Select.Content>
          <Select.Item value="__create__">
            <PlusIcon aria-hidden="true" /> {t("createExercise")}
          </Select.Item>
          {options.length ? <Select.Separator /> : null}
          {options.map((exercise) => (
            <Select.Item key={exercise.id} value={exercise.id}>
              {exercise.defaultName}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
      <Dialog.Root
        open={open}
        onOpenChange={(next) => {
          if (!creating) setOpen(next);
        }}
      >
        <Dialog.Content
          maxWidth="420px"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        >
          <Dialog.Title>{t("createExercise")}</Dialog.Title>
          <Dialog.Description size="2" mb="4">
            {t("inlineExerciseHelp")}
          </Dialog.Description>
          <ActionForm
            className="form-grid"
            onSubmit={(event) => event.stopPropagation()}
            onPendingChange={setCreating}
            action={async (data) => {
              const result = await createExerciseOptionAction(data);
              if ("error" in result) return result;
              setCreated(result);
              select(result.id);
              setOpen(false);
            }}
          >
            <Text as="label" size="2" className="field-label">
              {t("defaultName")}
              <TextField.Root
                name="defaultName"
                required
                maxLength={120}
                placeholder={t("exerciseNamePlaceholder")}
              />
            </Text>
            <div className="card-actions">
              <Button highContrast type="submit">
                {t("createExercise")}
              </Button>
              <Dialog.Close>
                <Button highContrast type="button" variant="soft">
                  {t("cancel")}
                </Button>
              </Dialog.Close>
            </div>
          </ActionForm>
        </Dialog.Content>
      </Dialog.Root>
    </div>
  );
}
