import {
  Badge,
  Callout,
  Card,
  Grid,
  Heading,
  Link,
  Text,
  TextField,
} from "@radix-ui/themes";
import type { CSSProperties } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";
import { updateExerciseAction } from "@/api/actions";
import { calendarDate, usePageView, useSearch } from "@/api/views";
import { ActionForm } from "@/components/action-form";
import { ExerciseMetadata } from "@/components/exercise-metadata";
import { SubmitButton } from "@/components/submit-button";
import { useDictionary, useLocale } from "@/lib/i18n";
import { useSession } from "@/lib/session";

export default function ExerciseHistoryPage() {
  const { user } = useSession();
  const { exercise, workouts, today } = usePageView("exercise");
  const { id = "" } = useParams();
  const feedback = useSearch();
  const t = useDictionary();
  const locale = useLocale();
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
  const workingEntries = setEntries.filter((s) => s.type === "WORKING");
  const maxWeight = maxBy(workingEntries, (s) => s.weight);
  const maxReps = maxBy(workingEntries, (s) => s.reps);
  const monthlyTrend = buildMonthlyTrend(
    setEntries,
    locale,
    calendarDate(today),
  );
  const maxMonthlyVolume = Math.max(...monthlyTrend.map((m) => m.volume), 1);
  return (
    <section className="stack">
      <ExerciseMetadata
        id={id}
        canEdit={
          user?.role === "ADMIN" || exercise.createdByUserId === user?.id
        }
      />
      <Text>
        {t("workingVolume")}:{" "}
        {workingEntries.reduce((n, s) => n + s.weight * s.reps, 0)}
      </Text>
      <div className="page-header">
        <div>
          <Heading as="h1" size="8">
            {exercise.defaultName}
          </Heading>
          <Text as="p" size="2" color="gray">
            {t("exerciseHistoryIntro")}
          </Text>
        </div>
      </div>

      {user?.role === "ADMIN" || exercise.createdByUserId === user?.id ? (
        <Card asChild>
          <ActionForm
            id="edit-exercise"
            action={updateExerciseAction}
            className="form-grid"
          >
            <Heading as="h2" size="5">
              {t("editExercise")}
            </Heading>
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
        </Card>
      ) : null}

      <section className="stats-card-grid" aria-label={t("overview")}>
        <SummaryCard label={t("totalSets")} value={formatInteger(totalSets)} />
        <SummaryCard label={t("totalReps")} value={formatInteger(totalReps)} />
        <SummaryCard
          label={t("totalVolume")}
          value={formatNumber(totalVolume)}
        />
        <SummaryCard
          label={t("maxWeight")}
          value={
            maxWeight ? formatNumber(maxWeight.weight) : t("noLatestWorkout")
          }
        />
        <SummaryCard
          label={t("maxReps")}
          value={maxReps ? formatInteger(maxReps.reps) : t("noLatestWorkout")}
        />
      </section>

      <Grid columns={{ initial: "1", md: "2" }} gap="4">
        <Card asChild>
          <section className="stack">
            <div className="stats-section-header">
              <Heading as="h2" size="5">
                {t("monthlyTrend")}
              </Heading>
              <Text as="p" size="2" color="gray">
                {t("monthlyTrendIntro")}
              </Text>
            </div>
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
                    {formatNumber(month.volume)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </Card>

        <Card asChild>
          <section className="stack">
            <div className="section-heading">
              <Heading as="h2" size="5">
                {t("aliases")}
              </Heading>
              <Badge color="gray">{(exercise.aliases ?? []).length}</Badge>
            </div>
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
          </section>
        </Card>
      </Grid>

      <Card asChild>
        <section className="stack">
          <div className="section-heading">
            <Heading as="h2" size="5">
              {t("recentWorkouts")}
            </Heading>
            <Badge color="gray">{workouts.length}</Badge>
          </div>
          {workouts.length === 0 ? (
            <Card asChild>
              <div className="empty-state">
                <Text weight="bold">{t("noExerciseHistory")}</Text>
                <Text as="p" size="2" color="gray">
                  {t("exerciseHistoryIntro")}
                </Text>
              </div>
            </Card>
          ) : (
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
                        {formatNumber(volume)} {t("volume")}
                      </Text>
                    </RouterLink>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </Card>
    </section>
  );
}

type SetEntry = {
  reps: number;
  weight: number;
  workout: {
    date: Date;
  };
};

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

function buildMonthlyTrend(sets: SetEntry[], locale: string, today: Date) {
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(today);
    date.setMonth(date.getMonth() - (5 - index));
    date.setDate(1);

    return {
      key: formatMonthKey(date),
      label: date.toLocaleDateString(locale, { month: "short" }),
      volume: 0,
    };
  });
  const monthByKey = new Map(months.map((month) => [month.key, month]));

  for (const set of sets) {
    const month = monthByKey.get(formatMonthKey(set.workout.date));

    if (month) {
      month.volume += set.weight * set.reps;
    }
  }

  return months;
}

function maxBy<T>(items: T[], value: (item: T) => number) {
  return items.reduce<T | undefined>((best, item) => {
    if (!best || value(item) > value(best)) {
      return item;
    }

    return best;
  }, undefined);
}

function formatMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
