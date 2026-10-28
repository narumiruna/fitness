import {
  Badge,
  Button,
  Card,
  Flex,
  Heading,
  Text,
  TextArea,
  TextField,
} from "@radix-ui/themes";
import {
  createWorkoutSetAction,
  deleteWorkoutAction,
  duplicateWorkoutAction,
  saveWorkoutTemplateAction,
  updateWorkoutAction,
} from "@/api/actions";
import { usePageView } from "@/api/views";
import { ActionForm } from "@/components/action-form";
import { ConfirmDelete } from "@/components/confirm-delete";
import { FormSelect } from "@/components/form-select";
import { PreviousSession } from "@/components/previous-session";
import { RecordedSet } from "@/components/recorded-set";
import { SessionPanel } from "@/components/session-panel";
import { useDictionary, useLocale } from "@/lib/i18n";

export default function WorkoutPage() {
  const { workout, exercises, history, today } = usePageView("workout");
  const t = useDictionary();
  const locale = useLocale();
  const formatInteger = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
  const formatNumber = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
  const workoutDate = formatDateInput(workout.date);
  const nextOrder =
    workout.sets.reduce((max, set) => Math.max(max, set.order), 0) + 1;
  const performedSets = workout.sets.filter((s) => s.completed);
  const totalReps = performedSets.reduce((total, set) => total + set.reps, 0);
  const totalVolume = performedSets.reduce(
    (total, set) => total + set.weight * set.reps,
    0,
  );
  const exerciseCount = new Set(performedSets.map((set) => set.exerciseId))
    .size;
  if (workout.state !== "COMPLETED")
    return (
      <section className="stack workout-page">
        <Heading as="h1" size="8">
          {workout.title || t("workout")}
        </Heading>
        <Text size="2" color="gray">
          {workout.date.toLocaleDateString(locale)}
        </Text>
        <SessionPanel workout={workout} />
      </section>
    );
  return (
    <section className="stack workout-page">
      <div className="page-header">
        <div>
          <Heading as="h1" size="8">
            {workout.title || t("workout")}
          </Heading>
          <Text as="p" size="2" color="gray">
            {workout.date.toLocaleDateString(locale)}
          </Text>
        </div>
      </div>

      <Card asChild>
        <section className="stack" aria-label={t("overview")}>
          <Flex wrap="wrap" gap="4">
            <Text size="2">
              {t("totalSets")}:{" "}
              <strong>{formatInteger(performedSets.length)}</strong>
            </Text>
            <Text size="2">
              {t("totalReps")}: <strong>{formatInteger(totalReps)}</strong>
            </Text>
            <Text size="2" aria-describedby="workout-volume-definition">
              {t("totalVolume")}: <strong>{formatNumber(totalVolume)}</strong>{" "}
              {t("volumeUnit")}
            </Text>
            <Text size="2">
              {t("exercisesMetric")}:{" "}
              <strong>{formatInteger(exerciseCount)}</strong>
            </Text>
          </Flex>
          <Text as="p" size="1" color="gray" id="workout-volume-definition">
            {t("volumeDefinition")}
          </Text>
        </section>
      </Card>

      <CompletedSets />

      <Card asChild>
        <section className="stack">
          <Heading as="h2" size="5">
            {t("addSet")}
          </Heading>
          <ActionForm
            className="form-grid"
            action={createWorkoutSetAction}
            resetOnSuccess
          >
            <input name="workoutId" type="hidden" value={workout.id} />
            <Text as="label" size="2" weight="medium" className="field-label">
              {t("exercise")}
              <PreviousSession
                exercises={exercises}
                history={history}
                labels={{
                  exercise: t("exercise"),
                  previous: t("previousSession"),
                  empty: t("noPreviousSession"),
                  copy: t("copyValues"),
                }}
              />
            </Text>
            <Text as="label">
              {t("setType")}
              <FormSelect
                name="type"
                label={t("setType")}
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
              />
            </Text>
            <Text size="2">{t("rirHelp")}</Text>
            <div className="form-grid two">
              <Text as="label" size="2" weight="medium" className="field-label">
                {t("weight")}
                <TextField.Root
                  min="0"
                  name="weight"
                  required
                  step="0.001"
                  type="number"
                />
              </Text>
              <Text as="label" size="2" weight="medium" className="field-label">
                {t("reps")}
                <TextField.Root min="1" name="reps" required type="number" />
              </Text>
              <Text as="label" size="2" weight="medium" className="field-label">
                {t("order")}
                <TextField.Root
                  min="1"
                  name="order"
                  required
                  type="number"
                  defaultValue={nextOrder}
                />
              </Text>
            </div>
            <Text as="label" size="2" weight="medium" className="field-label">
              {t("notes")}
              <TextArea aria-label={t("notes")} name="notes" />
            </Text>
            <Button highContrast type="submit">
              {t("addSet")}
            </Button>
          </ActionForm>
        </section>
      </Card>

      {workout.notes ? (
        <Card>
          <Text as="p" size="2">
            {workout.notes}
          </Text>
        </Card>
      ) : null}

      <Card asChild>
        <details>
          <summary>{t("editWorkout")}</summary>
          <ActionForm action={updateWorkoutAction} className="form-grid">
            <input name="workoutId" type="hidden" value={workout.id} />
            <Text as="label" size="2" weight="medium" className="field-label">
              {t("date")}
              <TextField.Root
                defaultValue={workoutDate}
                name="date"
                required
                type="date"
              />
            </Text>
            <Text as="label" size="2" weight="medium" className="field-label">
              {t("workoutTitle")}
              <TextField.Root defaultValue={workout.title ?? ""} name="title" />
            </Text>
            <Text as="label" size="2" weight="medium" className="field-label">
              {t("notes")}
              <TextArea
                aria-label={t("notes")}
                defaultValue={workout.notes ?? ""}
                name="notes"
              />
            </Text>
            <Button highContrast variant="soft" type="submit">
              {t("updateWorkout")}
            </Button>
          </ActionForm>
        </details>
      </Card>

      <div className="card-actions">
        <ActionForm action={duplicateWorkoutAction}>
          <input name="sourceWorkoutId" type="hidden" value={workout.id} />
          <input name="date" type="hidden" value={today} />
          <Button highContrast variant="soft" type="submit">
            {t("repeatWorkout")}
          </Button>
        </ActionForm>
        <ConfirmDelete
          action={deleteWorkoutAction}
          fields={{ workoutId: workout.id }}
          title={t("confirmDelete")}
          description={t("deleteDescription")}
          cancel={t("cancel")}
          confirm={t("delete")}
        />
      </div>

      <Card asChild>
        <details>
          <summary>{t("saveAsTemplate")}</summary>
          <ActionForm action={saveWorkoutTemplateAction} className="form-grid">
            <input name="workoutId" type="hidden" value={workout.id} />
            <Text as="label" size="2" weight="medium" className="field-label">
              {t("templateName")}
              <TextField.Root
                defaultValue={workout.title || t("workout")}
                name="title"
                required
              />
            </Text>
            <Button highContrast variant="soft" type="submit">
              {t("saveAsTemplate")}
            </Button>
          </ActionForm>
        </details>
      </Card>

      <SessionPanel workout={workout} />
    </section>
  );
}

function CompletedSets() {
  const { workout, exercises } = usePageView("workout");
  const t = useDictionary();
  return (
    <Card asChild>
      <section className="stack">
        <div className="section-heading">
          <Heading as="h2" size="5">
            {t("setsMetric")}
          </Heading>
          <Badge color="gray">{workout.sets.length}</Badge>
        </div>

        {workout.sets.length === 0 ? (
          <Text as="p" size="2" color="gray">
            {t("noSets")}
          </Text>
        ) : (
          <div className="recorded-set-list">
            {workout.sets.map((set) => (
              <RecordedSet
                key={setFormKey(set)}
                set={set}
                workoutId={workout.id}
                exercises={exercises}
              />
            ))}
          </div>
        )}
      </section>
    </Card>
  );
}

// Remount the editor only when confirmed values change, not when its disclosure closes.
function setFormKey(set: {
  id: string;
  exerciseId: string;
  order: number;
  weight: number;
  reps: number;
  notes: string | null;
}) {
  return JSON.stringify([
    set.id,
    set.exerciseId,
    set.order,
    set.weight,
    set.reps,
    set.notes,
    "type" in set ? set.type : null,
    "rir" in set ? set.rir : null,
  ]);
}

function formatDateInput(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
