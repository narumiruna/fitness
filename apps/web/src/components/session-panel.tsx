import {
  Badge,
  Button,
  Card,
  Heading,
  Progress,
  Text,
  TextField,
} from "@radix-ui/themes";
import { useState } from "react";
import {
  acceptProgressionAction,
  editSessionSetAction,
  startSessionAction,
} from "@/api/actions";
import { type PageView, usePageView } from "@/api/views";
import { ActionForm } from "@/components/action-form";
import { type MessageKey, useDictionary, useLocale } from "@/lib/i18n";
import { RestTimer } from "./rest-timer";
import { SafeForm } from "./safe-form";
import { SessionControls } from "./session-controls";

export function StartSessionForm({
  sourceId,
  source,
  date,
  scheduled = false,
  onPendingChange,
}: {
  sourceId: string;
  source: "template" | "workout";
  date: string;
  scheduled?: boolean;
  onPendingChange?: (pending: boolean) => void;
}) {
  const t = useDictionary();
  const [draftKey] = useState(() => crypto.randomUUID());
  return (
    <ActionForm
      action={startSessionAction}
      className="form-grid"
      onPendingChange={onPendingChange}
    >
      <input type="hidden" name="sourceId" value={sourceId} />
      <input type="hidden" name="source" value={source} />
      <input type="hidden" name="key" value={draftKey} />
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
    </ActionForm>
  );
}
export function SessionPanel({
  workout,
}: {
  workout: PageView<"workout">["workout"];
}) {
  const t = useDictionary();
  const locale = useLocale();
  const { previews, today } = usePageView("workout");
  if (workout.state === "COMPLETED")
    return (
      <Card asChild>
        <details>
          <summary>{t("trainingSession")}</summary>
          <StartSessionForm
            sourceId={workout.id}
            source="workout"
            date={today}
          />
        </details>
      </Card>
    );
  const live = workout.state === "ACTIVE" || workout.state === "PAUSED";
  const completedSets = workout.sets.filter((set) => set.completed).length;
  const number = new Intl.NumberFormat(locale);
  const currentSetId = live
    ? workout.sets.find((set) => !set.completed)?.id
    : undefined;
  const orderedSets = [...workout.sets].sort(
    (a, b) => Number(b.id === currentSetId) - Number(a.id === currentSetId),
  );
  const sessionErrors = {
    invalidSessionInput: t("invalidSessionInput"),
    sessionConflict: t("sessionConflict"),
    sessionIncomplete: t("sessionIncomplete"),
    sessionUnavailable: t("sessionUnavailable"),
  };
  const controls = live ? (
    <SessionControls
      workoutId={workout.id}
      version={workout.version}
      active={workout.state === "ACTIVE"}
      skipped={workout.sets.length - completedSets}
      messages={{
        pause: t("pause"),
        resume: t("resume"),
        finish: t("finish"),
        abandon: t("abandon"),
        cancel: t("cancel"),
        finishSkipped: t("finishSkipped"),
        skippedDescription: t("skippedDescription"),
        abandonDescription: t("abandonDescription"),
        saved: t("saved"),
        saveFailed: t("saveFailed"),
        refresh: t("refreshSession"),
        errors: sessionErrors,
      }}
    />
  ) : null;
  return (
    <Card className="stack session-panel">
      <div className="section-heading">
        <Heading as="h2" size="5">
          {t("trainingSession")}
        </Heading>
        <Badge>{t(workout.state as MessageKey)}</Badge>
      </div>
      <div className="session-overview stack">
        <div className="session-progress stack">
          <Text size="2" weight="medium">
            {t("sessionProgress")
              .replace("{completed}", number.format(completedSets))
              .replace("{total}", number.format(workout.sets.length))}
          </Text>
          <Progress
            value={
              workout.sets.length
                ? (completedSets / workout.sets.length) * 100
                : 0
            }
            aria-label={t("trainingSession")}
          />
        </div>
        <div className="session-clock">
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
        </div>
        {controls}
      </div>
      <div className="stack">
        {orderedSets.map((s) => {
          const current = s.id === currentSetId;
          return (
            <Card asChild key={s.id}>
              <details
                className="session-set"
                data-current={current || undefined}
                open={current}
              >
                <summary>
                  <Text weight="bold">
                    {current ? `${t("currentSessionSet")}: ` : ""}#{s.order}{" "}
                    {s.exercise?.defaultName}
                  </Text>
                  <br />
                  <Text size="2" color="gray">
                    {t("target")}: {s.targetWeight} kg × {s.targetReps} —{" "}
                    {t(s.type as MessageKey)} —{" "}
                    {s.completed ? t("COMPLETED") : t("planned")}
                  </Text>
                  {s.actualsEntered && (s.completed || !live) ? (
                    <>
                      <br />
                      <Text size="2">
                        {s.weight} kg × {s.reps}
                      </Text>
                    </>
                  ) : null}
                </summary>
                {live ? (
                  <SafeForm
                    action={editSessionSetAction}
                    errors={sessionErrors}
                    refreshLabel={t("refreshSession")}
                    error={t("saveFailed")}
                    success={t("saved")}
                  >
                    <input type="hidden" name="workoutId" value={workout.id} />
                    <input type="hidden" name="setId" value={s.id} />
                    <input
                      type="hidden"
                      name="version"
                      value={workout.version}
                    />
                    <input
                      type="hidden"
                      name="exerciseId"
                      value={s.exerciseId}
                    />
                    <input type="hidden" name="order" value={s.order} />
                    <input type="hidden" name="type" value={s.type} />
                    <div className="form-grid two">
                      <Text as="label" className="field-label">
                        {t("weight")}
                        <TextField.Root
                          name="weight"
                          type="number"
                          min={0}
                          max={2000}
                          step="0.001"
                          defaultValue={s.actualsEntered ? s.weight : ""}
                          required
                        />
                      </Text>
                      <Text as="label" className="field-label">
                        {t("reps")}
                        <TextField.Root
                          name="reps"
                          type="number"
                          min={1}
                          max={1000}
                          defaultValue={s.actualsEntered ? s.reps : ""}
                          required
                        />
                      </Text>
                    </div>
                    <div className="card-actions">
                      {/* Keep input Enter save-only; completion requires its explicit action. */}
                      <Button highContrast variant="soft" type="submit">
                        {t("save")}
                      </Button>
                      {!s.completed && workout.state === "ACTIVE" ? (
                        <Button
                          highContrast
                          variant={current ? "solid" : "soft"}
                          type="submit"
                          name="command"
                          value="complete"
                        >
                          {t("complete")}
                        </Button>
                      ) : null}
                    </div>
                    <details>
                      <summary>{t("sessionOptionalFields")}</summary>
                      <div className="form-grid">
                        <Text as="label" className="field-label">
                          {t("rir")}
                          <TextField.Root
                            name="rir"
                            type="number"
                            min={0}
                            max={10}
                            step="0.5"
                            defaultValue={s.rir ?? ""}
                            aria-describedby={`session-rir-help-${s.id}`}
                          />
                        </Text>
                        <Text
                          id={`session-rir-help-${s.id}`}
                          size="2"
                          color="gray"
                        >
                          {t("rirHelp")}
                        </Text>
                        <Text as="label" className="field-label">
                          {t("notes")}
                          <TextField.Root
                            name="notes"
                            defaultValue={s.notes ?? ""}
                          />
                        </Text>
                      </div>
                    </details>
                  </SafeForm>
                ) : null}
              </details>
            </Card>
          );
        })}
      </div>
      {previews.length > 0 ? (
        <details>
          <summary>{t("progression")}</summary>
          <div className="stack">
            {previews.map((p) => (
              <div key={p.exerciseId} className="stack">
                <Heading as="h3" size="3">
                  {
                    workout.sets.find((s) => s.exerciseId === p.exerciseId)
                      ?.exercise?.defaultName
                  }
                </Heading>
                <Text>
                  {t(p.reason as MessageKey)} {p.sourceDate?.slice(0, 10)}{" "}
                  {p.weight !== null
                    ? `${p.weight} kg (+${p.increment} kg)`
                    : ""}
                </Text>
                {p.weight !== null ? (
                  <SafeForm
                    action={acceptProgressionAction}
                    error={t("saveFailed")}
                    success={t("saved")}
                  >
                    <input type="hidden" name="workoutId" value={workout.id} />
                    <input
                      type="hidden"
                      name="exerciseId"
                      value={p.exerciseId}
                    />
                    <input
                      type="hidden"
                      name="sourceId"
                      value={p.sourceId ?? ""}
                    />
                    <input type="hidden" name="version" value={p.version} />
                    <input type="hidden" name="weight" value={p.weight} />
                    <Button highContrast variant="soft" type="submit">
                      {t("acceptSuggestion")}
                    </Button>
                    <Text>{t("rejectSuggestion")}</Text>
                  </SafeForm>
                ) : null}
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </Card>
  );
}
