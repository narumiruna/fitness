import {
  Badge,
  Button,
  Heading,
  Link,
  Text,
  TextArea,
  TextField,
} from "@radix-ui/themes";
import { Link as RouterLink } from "react-router-dom";
import { deleteWorkoutSetAction, updateWorkoutSetAction } from "@/api/actions";
import type { PageView } from "@/api/views";
import { useDictionary } from "@/lib/i18n";
import { ActionForm } from "./action-form";
import { ConfirmDelete } from "./confirm-delete";
import { FormSelect } from "./form-select";
import { SetResult } from "./set-result";

export function RecordedSet({
  set,
  workoutId,
  exercises,
}: {
  set: PageView<"workout">["workout"]["sets"][number];
  workoutId: string;
  exercises: PageView<"workout">["exercises"];
}) {
  const t = useDictionary();
  const deleteSet = (
    <ConfirmDelete
      action={deleteWorkoutSetAction}
      fields={{ workoutId, setId: set.id }}
      title={t("confirmDelete")}
      description={t("deleteDescription")}
      cancel={t("cancel")}
      confirm={t("delete")}
    />
  );
  return (
    <article className="recorded-set" data-set-id={set.id}>
      <div className="recorded-set-readout">
        <div className="recorded-set-identity">
          <Badge color="gray" variant="soft">
            #{set.order}
          </Badge>
          <Heading as="h3" size="4">
            <Link highContrast asChild>
              <RouterLink to={`/exercises/${set.exerciseId}`}>
                {set.exercise?.defaultName}
              </RouterLink>
            </Link>
          </Heading>
        </div>
        {set.completed ? (
          <SetResult set={set} />
        ) : (
          <Badge color="gray" className="recorded-set-skipped">
            {t("skipped")}
          </Badge>
        )}
      </div>
      {set.completed ? (
        <details className="recorded-set-editor">
          <summary>{t("updateSet")}</summary>
          <div className="stack">
            <ActionForm className="form-grid" action={updateWorkoutSetAction}>
              <input name="workoutId" type="hidden" value={workoutId} />
              <input name="setId" type="hidden" value={set.id} />
              <Text as="label">
                {t("setType")}
                <FormSelect
                  name="type"
                  label={t("setType")}
                  defaultValue={set.type}
                  options={[
                    { value: "WORKING", label: t("WORKING") },
                    { value: "WARMUP", label: t("WARMUP") },
                  ]}
                />
              </Text>
              <Text as="label">
                {t("rir")}
                <TextField.Root
                  name="rir"
                  type="number"
                  min={0}
                  max={10}
                  step="0.5"
                  defaultValue={set.rir ?? ""}
                />
              </Text>
              <Text as="label" size="2" weight="medium" className="field-label">
                {t("exercise")}
                <FormSelect
                  defaultValue={set.exerciseId}
                  name="exerciseId"
                  required
                  label={t("exercise")}
                  options={exercises.map((exercise) => ({
                    value: exercise.id,
                    label: exercise.defaultName,
                  }))}
                />
              </Text>
              <div className="form-grid two">
                <Text
                  as="label"
                  size="2"
                  weight="medium"
                  className="field-label"
                >
                  {t("weight")}
                  <TextField.Root
                    defaultValue={set.weight}
                    min="0"
                    name="weight"
                    required
                    step="0.001"
                    type="number"
                  />
                </Text>
                <Text
                  as="label"
                  size="2"
                  weight="medium"
                  className="field-label"
                >
                  {t("reps")}
                  <TextField.Root
                    defaultValue={set.reps}
                    min="1"
                    name="reps"
                    required
                    type="number"
                  />
                </Text>
                <Text
                  as="label"
                  size="2"
                  weight="medium"
                  className="field-label"
                >
                  {t("order")}
                  <TextField.Root
                    defaultValue={set.order}
                    min="1"
                    name="order"
                    required
                    type="number"
                  />
                </Text>
              </div>
              <Text as="label" size="2" weight="medium" className="field-label">
                {t("notes")}
                <TextArea
                  aria-label={t("notes")}
                  defaultValue={set.notes ?? ""}
                  name="notes"
                />
              </Text>
              <Button highContrast variant="soft" type="submit">
                {t("updateSet")}
              </Button>
            </ActionForm>
            {deleteSet}
          </div>
        </details>
      ) : (
        deleteSet
      )}
    </article>
  );
}
