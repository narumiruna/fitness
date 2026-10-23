import { buildExerciseMonthlyTrend } from "@narumitw/fitness-core/calendar";
import {
  Badge,
  Button,
  Callout,
  Card,
  Heading,
  Link,
  Text,
  TextField,
} from "@radix-ui/themes";
import { type CSSProperties, useLayoutEffect, useRef } from "react";
import { Link as RouterLink, useLocation, useParams } from "react-router-dom";
import { updateExerciseAction } from "@/api/actions";
import { calendarDate, usePageView, useSearch } from "@/api/views";
import { ActionForm } from "@/components/action-form";
import { EmptyState } from "@/components/dashboard";
import {
  ExerciseMetadata,
  ExerciseMetadataSummary,
} from "@/components/exercise-metadata";
import { SubmitButton } from "@/components/submit-button";
import { useDictionary, useLocale } from "@/lib/i18n";
import { useSession } from "@/lib/session";

export default function ExerciseHistoryPage() {
  const { user } = useSession();
  const { exercise, workouts, today } = usePageView("exercise");
  const { id = "" } = useParams();
  const { hash } = useLocation();
  const feedback = useSearch();
  const editName = useRef<HTMLDetailsElement>(null);
  const t = useDictionary();
  const locale = useLocale();
  const canEdit =
    user?.role === "ADMIN" || exercise.createdByUserId === user?.id;
  useLayoutEffect(() => {
    if (
      hash === "#edit-exercise" ||
      feedback.error === "duplicate" ||
      feedback.saved === "1"
    ) {
      if (editName.current) editName.current.open = true;
      if (hash === "#edit-exercise") {
        document.getElementById("edit-exercise")?.scrollIntoView();
      }
    }
  }, [hash, feedback.error, feedback.saved]);
  const formatInteger = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
  const formatNumber = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
  const setEntries = workouts.flatMap((workout) =>
    workout.sets.map((set) => ({ ...set, workout })),
  );
  const totalSets = setEntries.length;
  const totalReps = setEntries.reduce((total, set) => total + set.reps, 0);
  const totalVolume = setEntries.reduce(
    (total, set) => total + set.weight * set.reps,
    0,
  );
  const workingEntries = setEntries.filter((set) => set.type === "WORKING");
  const maxWeight = maxBy(workingEntries, (set) => set.weight);
  const maxReps = maxBy(workingEntries, (set) => set.reps);
  const monthlyTrend = buildExerciseMonthlyTrend(
    setEntries,
    locale,
    calendarDate(today),
  );
  const maxMonthlyVolume = Math.max(
    ...monthlyTrend.map((month) => month.volume),
    1,
  );
  return (
    <section className="stack">
      <Heading as="h1" size="8">
        {exercise.defaultName}
      </Heading>
      <ExerciseMetadataSummary />

      {workouts.length === 0 ? (
        <EmptyState title={t("noExerciseHistory")}>
          <Button highContrast asChild variant="soft">
            <RouterLink to="/workouts/new">{t("newWorkoutAction")}</RouterLink>
          </Button>
        </EmptyState>
      ) : (
        <>
          <section className="stats-card-grid" aria-label={t("overview")}>
            <SummaryCard
              label={t("totalSets")}
              value={formatInteger(totalSets)}
            />
            <SummaryCard
              label={t("totalReps")}
              value={formatInteger(totalReps)}
            />
            <SummaryCard
              label={t("totalVolume")}
              value={`${formatNumber(totalVolume)} ${t("volumeUnit")}`}
            />
            <SummaryCard
              label={t("workingVolume")}
              value={`${formatNumber(workingEntries.reduce((total, set) => total + set.weight * set.reps, 0))} ${t("volumeUnit")}`}
            />
            <SummaryCard
              label={t("maxWeight")}
              value={
                maxWeight
                  ? `${formatNumber(maxWeight.weight)} kg`
                  : t("noLatestWorkout")
              }
            />
            <SummaryCard
              label={t("maxReps")}
              value={
                maxReps ? formatInteger(maxReps.reps) : t("noLatestWorkout")
              }
            />
          </section>
          <Card asChild>
            <section className="stack">
              <div className="section-heading">
                <Heading as="h2" size="5">
                  {t("recentWorkouts")}
                </Heading>
                <Badge color="gray">{workouts.length}</Badge>
              </div>
              <div className="agenda-list">
                {workouts.map((workout) => {
                  const reps = workout.sets.reduce(
                    (total, set) => total + set.reps,
                    0,
                  );
                  const volume = workout.sets.reduce(
                    (total, set) => total + set.weight * set.reps,
                    0,
                  );
                  return (
                    <Link highContrast asChild key={workout.id}>
                      <RouterLink
                        className="agenda-item"
                        to={`/workouts/${workout.id}`}
                      >
                        <time dateTime={workout.date.toISOString()}>
                          {workout.date.toLocaleDateString(locale, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </time>
                        <span>{workout.title || t("workout")}</span>
                        <Text size="1" color="gray">
                          {workout.sets.length}{" "}
                          {workout.sets.length === 1 ? t("set") : t("sets")} ·{" "}
                          {formatInteger(reps)} {t("reps")} ·{" "}
                          {formatNumber(volume)} {t("volumeUnit")}
                        </Text>
                      </RouterLink>
                    </Link>
                  );
                })}
              </div>
            </section>
          </Card>
          <Card asChild>
            <section className="stack">
              <Heading as="h2" size="5">
                {t("monthlyTrend")}
              </Heading>
              <Text as="p" size="2" color="gray">
                {t("monthlyTrendIntro")} {t("volumeDefinition")}
              </Text>
              <div className="stats-bars">
                {monthlyTrend.map((month) => (
                  <div className="stats-bar-row" key={month.key}>
                    <span className="stats-bar-label">{month.label}</span>
                    <span className="stats-bar-track">
                      <span
                        className="stats-bar-fill"
                        style={
                          {
                            "--bar-width": `${(month.volume / maxMonthlyVolume) * 100}%`,
                          } as CSSProperties
                        }
                      />
                    </span>
                    <span className="stats-bar-value">
                      {formatNumber(month.volume)} {t("volumeUnit")}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </Card>
        </>
      )}

      <details className="dashboard-tools">
        <summary>
          {t("aliases")} ({(exercise.aliases ?? []).length})
        </summary>
        {(exercise.aliases ?? []).length > 0 ? (
          <div className="alias-list">
            {(exercise.aliases ?? []).map((alias) => (
              <Badge color="gray" variant="soft" key={alias.id}>
                {alias.alias}
                <Text size="1" color="gray">
                  {alias.locale}
                </Text>
              </Badge>
            ))}
          </div>
        ) : (
          <Text as="p" size="2" color="gray">
            {t("noAliases")}
          </Text>
        )}
      </details>

      {canEdit ? (
        <>
          <Card asChild>
            <details ref={editName} className="dashboard-tools">
              <summary>{t("editExercise")}</summary>
              <ActionForm
                id="edit-exercise"
                action={async (data) => {
                  try {
                    return await updateExerciseAction(data);
                  } finally {
                    if (editName.current) editName.current.open = true;
                  }
                }}
                className="form-grid"
              >
                <Text as="p" size="2" color="gray">
                  {t("exerciseEditHelp")}
                </Text>
                {feedback.error === "duplicate" ? (
                  <Callout.Root color="red" role="alert">
                    <Callout.Text>{t("duplicateExercise")}</Callout.Text>
                  </Callout.Root>
                ) : feedback.saved === "1" ? (
                  <Text role="status">{t("saved")}</Text>
                ) : null}
                <input type="hidden" name="exerciseId" value={id} />
                <Text as="label" size="2" className="field-label">
                  {t("defaultName")}
                  <TextField.Root
                    name="defaultName"
                    defaultValue={exercise.defaultName}
                    maxLength={120}
                    required
                  />
                </Text>
                <SubmitButton>{t("save")}</SubmitButton>
              </ActionForm>
            </details>
          </Card>
          <ExerciseMetadata id={id} />
        </>
      ) : null}
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card asChild>
      <article className="stats-card">
        <Text size="2" color="gray">
          {label}
        </Text>
        <Text size="7" weight="bold">
          {value}
        </Text>
      </article>
    </Card>
  );
}

function maxBy<T>(items: T[], value: (item: T) => number) {
  return items.reduce<T | undefined>((best, item) => {
    if (!best || value(item) > value(best)) return item;
    return best;
  }, undefined);
}
