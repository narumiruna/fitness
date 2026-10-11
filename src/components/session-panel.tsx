import { randomUUID } from "node:crypto";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Heading,
  Text,
  TextField,
} from "@radix-ui/themes";
import { acceptProgressionAction } from "@/app/actions/progression";
import {
  changeSessionAction,
  editSessionSetAction,
  startSessionAction,
} from "@/app/actions/sessions";
import type { Workout, WorkoutSet } from "@/generated/prisma/client";
import { formatDateKey } from "@/lib/calendar";
import { getDictionary, type MessageKey } from "@/lib/i18n";
import { suggestions } from "@/lib/progression";
import { RestTimer } from "./rest-timer";
import { SafeForm } from "./safe-form";

export async function StartSessionForm({
  sourceId,
  source,
  date,
  scheduled = false,
}: {
  sourceId: string;
  source: "template" | "workout";
  date: string;
  scheduled?: boolean;
}) {
  const t = await getDictionary();
  return (
    <form action={startSessionAction} className="form-grid">
      <input type="hidden" name="sourceId" value={sourceId} />
      <input type="hidden" name="source" value={source} />
      <input type="hidden" name="key" value={randomUUID()} />
      <input type="hidden" name="scheduled" value={String(scheduled)} />
      <Text as="label">
        {t("date")}
        <TextField.Root
          name="date"
          type="date"
          defaultValue={date}
          required
          readOnly={scheduled}
        />
      </Text>
      <Text as="label">
        {t("restSeconds")}
        <TextField.Root
          name="restSeconds"
          type="number"
          min={0}
          max={3600}
          defaultValue={90}
          required
        />
      </Text>
      <Button highContrast type="submit">
        {t("startSession")}
      </Button>
    </form>
  );
}
export async function SessionPanel({
  workout,
  userId,
}: {
  workout: Workout & {
    sets: (WorkoutSet & { exercise: { defaultName: string } })[];
  };
  userId: string;
}) {
  const t = await getDictionary();
  if (workout.state === "COMPLETED")
    return (
      <Card>
        <Heading as="h2" size="4">
          {t("trainingSession")}
        </Heading>
        <StartSessionForm
          sourceId={workout.id}
          source="workout"
          date={formatDateKey(new Date())}
        />
      </Card>
    );
  const live = workout.state === "ACTIVE" || workout.state === "PAUSED";
  const previews = await suggestions(userId, workout.id);
  return (
    <Card className="stack">
      <Heading as="h2" size="5">
        {t("trainingSession")}
      </Heading>
      <Badge>{t(workout.state as MessageKey)}</Badge>
      <RestTimer
        deadline={workout.restDeadline?.toISOString() ?? null}
        label={t("restRemaining")}
        activeSeconds={workout.activeSeconds}
        resumedAt={
          workout.state === "ACTIVE"
            ? (workout.resumedAt?.toISOString() ?? null)
            : null
        }
        durationLabel={t("activeSeconds")}
      />
      {live ? (
        <SafeForm
          action={changeSessionAction}
          error={t("saveFailed")}
          success={t("saved")}
        >
          <input type="hidden" name="workoutId" value={workout.id} />
          <input type="hidden" name="version" value={workout.version} />
          <div className="card-actions">
            <Button
              highContrast
              name="command"
              value={workout.state === "ACTIVE" ? "pause" : "resume"}
              type="submit"
            >
              {t(workout.state === "ACTIVE" ? "pause" : "resume")}
            </Button>
            <Button highContrast name="command" value="finish" type="submit">
              {t("finish")}
            </Button>
            <Button
              highContrast
              name="command"
              value="abandon"
              type="submit"
              variant="soft"
            >
              {t("abandon")}
            </Button>
          </div>
          <Text as="label">
            <Checkbox name="partial" defaultChecked={false} />{" "}
            {t("partialFinish")}
          </Text>
        </SafeForm>
      ) : null}
      {previews.map((p) => (
        <div key={p.exerciseId} className="stack">
          <Heading as="h2" size="3">
            {t("progression")}:{" "}
            {
              workout.sets.find((s) => s.exerciseId === p.exerciseId)?.exercise
                .defaultName
            }
          </Heading>
          <Text>
            {t(p.reason as MessageKey)} {p.sourceDate?.slice(0, 10)}{" "}
            {p.weight !== null ? `${p.weight} kg (+${p.increment} kg)` : ""}
          </Text>
          {p.weight !== null ? (
            <SafeForm
              action={acceptProgressionAction}
              error={t("saveFailed")}
              success={t("saved")}
            >
              <input type="hidden" name="workoutId" value={workout.id} />
              <input type="hidden" name="exerciseId" value={p.exerciseId} />
              <input type="hidden" name="sourceId" value={p.sourceId ?? ""} />
              <input type="hidden" name="version" value={p.version} />
              <input type="hidden" name="weight" value={p.weight} />
              <Button highContrast type="submit">
                {t("acceptSuggestion")}
              </Button>
              <Text>{t("rejectSuggestion")}</Text>
            </SafeForm>
          ) : null}
        </div>
      ))}
      {workout.sets.map((s) => (
        <Card key={`${s.id}-${workout.version}`} className="stack">
          <Heading as="h2" size="4">
            #{s.order} {s.exercise.defaultName}
          </Heading>
          <Text>
            {t("target")}: {s.targetWeight} kg × {s.targetReps} —{" "}
            {t(s.type as MessageKey)} —{" "}
            {s.completed ? t("COMPLETED") : t("planned")}
          </Text>
          {live ? (
            <>
              <SafeForm
                action={editSessionSetAction}
                error={t("saveFailed")}
                success={t("saved")}
              >
                <input type="hidden" name="workoutId" value={workout.id} />
                <input type="hidden" name="setId" value={s.id} />
                <input type="hidden" name="version" value={workout.version} />
                <input type="hidden" name="exerciseId" value={s.exerciseId} />
                <input type="hidden" name="order" value={s.order} />
                <input type="hidden" name="type" value={s.type} />
                <Text as="label">
                  {t("weight")}
                  <TextField.Root
                    name="weight"
                    type="number"
                    min={0}
                    max={2000}
                    step="0.001"
                    defaultValue={s.weight}
                    required
                  />
                </Text>
                <Text as="label">
                  {t("reps")}
                  <TextField.Root
                    name="reps"
                    type="number"
                    min={1}
                    max={1000}
                    defaultValue={s.reps}
                    required
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
                    defaultValue={s.rir ?? ""}
                  />
                </Text>
                <Text as="label">
                  {t("notes")}
                  <TextField.Root name="notes" defaultValue={s.notes ?? ""} />
                </Text>
                <Button highContrast type="submit">
                  {t("save")}
                </Button>
              </SafeForm>
              {!s.completed && workout.state === "ACTIVE" ? (
                <SafeForm
                  action={changeSessionAction}
                  error={t("saveFailed")}
                  success={t("saved")}
                >
                  <input type="hidden" name="workoutId" value={workout.id} />
                  <input type="hidden" name="version" value={workout.version} />
                  <input type="hidden" name="setId" value={s.id} />
                  <input type="hidden" name="command" value="complete" />
                  <Button highContrast type="submit">
                    {t("complete")}
                  </Button>
                </SafeForm>
              ) : null}
            </>
          ) : null}
        </Card>
      ))}
    </Card>
  );
}
