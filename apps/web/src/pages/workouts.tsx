import { formatDateKey } from "@narumitw/fitness-core/calendar";
import { sumVolume } from "@narumitw/fitness-core/stats-calculations";
import { PlusIcon } from "@radix-ui/react-icons";
import {
  Badge,
  Button,
  Card,
  Heading,
  Text,
  TextField,
} from "@radix-ui/themes";
import { Fragment } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  createWorkoutFromTemplateAction,
  deleteWorkoutTemplateAction,
  duplicateWorkoutAction,
} from "@/api/actions";
import { calendarDate, usePageView } from "@/api/views";
import { ActionForm } from "@/components/action-form";
import { ConfirmDelete } from "@/components/confirm-delete";
import {
  EmptyState,
  MetricCard,
  PageHeader,
  StrengthIcon,
} from "@/components/dashboard";
import { FormSelect } from "@/components/form-select";
import { NotesCheckbox } from "@/components/notes-checkbox";
import { SubmitButton } from "@/components/submit-button";
import { TemplatePlanning } from "@/components/template-planning";
import { WorkoutCalendar } from "@/components/workout-calendar";
import { type MessageKey, useDictionary, useLocale } from "@/lib/i18n";

type WorkoutFilters = {
  exerciseId: string;
  month: string;
  notesOnly: boolean;
  page: number;
  q: string;
};
export default function WorkoutsPage() {
  const {
    filteredWorkoutCount,
    totalHistoryCount,
    totalWorkoutCount,
    workoutsThisMonth,
    totals,
    totalPages,
    currentPage,
    workouts,
    exerciseOptions,
    templates,
    filters,
    today,
  } = usePageView("workouts");
  const t = useDictionary();
  const locale = useLocale();
  const now = calendarDate(today);
  const formatInteger = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
  const formatNumber = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
  return (
    <section className="stack workouts-page">
      <PageHeader title={t("workouts")} description={t("workoutsIntro")}>
        <Button highContrast asChild>
          <RouterLink to="/workouts/new">
            <PlusIcon aria-hidden="true" />
            {t("newWorkoutAction")}
          </RouterLink>
        </Button>
      </PageHeader>
      {totalWorkoutCount > 0 ? (
        <section className="workouts-summary-grid" aria-label={t("overview")}>
          <MetricCard
            label={t("totalWorkouts")}
            value={formatInteger(totalWorkoutCount)}
          />
          <MetricCard
            icon="volume"
            label={t("totalVolume")}
            value={`${formatNumber(totals[0].volume)} kg`}
          />
          <MetricCard
            icon="sets"
            label={t("totalSets")}
            value={formatInteger(Number(totals[0].count))}
          />
          <MetricCard
            icon="calendar"
            label={t("monthWorkouts")}
            value={formatInteger(workoutsThisMonth)}
          />
        </section>
      ) : null}
      <div className="workouts-layout">
        <Card asChild>
          <section className="workouts-list stack">
            <div className="section-heading">
              <Heading as="h2" size="5">
                {t("workoutHistory")}
              </Heading>
              <Badge color="gray">{filteredWorkoutCount}</Badge>
            </div>
            {totalHistoryCount > 0 ? (
              <ActionForm
                action="/workouts"
                className="history-filters"
                key={JSON.stringify(filters)}
              >
                <Text as="label" size="2" className="field-label search-field">
                  {t("search")}
                  <TextField.Root
                    defaultValue={filters.q}
                    name="q"
                    placeholder={t("workoutSearchPlaceholder")}
                  />
                </Text>
                <Text as="label" size="2" className="field-label">
                  {t("month")}
                  <TextField.Root
                    defaultValue={filters.month}
                    name="month"
                    type="month"
                  />
                </Text>
                <Text as="label" size="2" className="field-label">
                  {t("exercise")}
                  <FormSelect
                    name="exercise"
                    defaultValue={filters.exerciseId}
                    label={t("exercise")}
                    options={[
                      { value: "", label: t("allExercises") },
                      ...exerciseOptions.map((e) => ({
                        value: e.id,
                        label: e.defaultName,
                      })),
                    ]}
                  />
                </Text>
                <Text as="label" size="2" className="checkbox-label">
                  <NotesCheckbox defaultChecked={filters.notesOnly} />
                  {t("onlyWorkoutsWithNotes")}
                </Text>
                <div className="toolbar-actions">
                  <Button highContrast variant="soft" type="submit">
                    {t("applyFilters")}
                  </Button>
                  <Button highContrast asChild variant="ghost">
                    <RouterLink to="/workouts">{t("clearFilters")}</RouterLink>
                  </Button>
                </div>
              </ActionForm>
            ) : null}
            {workouts.length === 0 ? (
              <EmptyState
                title={t(totalHistoryCount ? "noWorkoutResults" : "noWorkouts")}
                description={t("workoutsIntro")}
              />
            ) : (
              workouts.map((workout, index) => {
                const month = workout.date.toLocaleDateString(locale, {
                  month: "long",
                  year: "numeric",
                });
                const previous = workouts[index - 1]?.date.toLocaleDateString(
                  locale,
                  { month: "long", year: "numeric" },
                );
                const completed = workout.sets.filter((set) => set.completed);
                const names = [
                  ...new Set(
                    (workout.state === "COMPLETED"
                      ? completed
                      : workout.sets
                    ).map((s) => s.exercise?.defaultName),
                  ),
                ];
                return (
                  <Fragment key={workout.id}>
                    {month !== previous ? (
                      <Heading className="month-heading" as="h3" size="3">
                        {month}
                      </Heading>
                    ) : null}
                    <article className="workout-card">
                      <time
                        className="workout-date"
                        dateTime={formatDateKey(workout.date)}
                      >
                        <span>
                          {workout.date.toLocaleDateString(locale, {
                            month: "short",
                          })}
                        </span>
                        <strong>{workout.date.getDate()}</strong>
                        <span>
                          {workout.date.toLocaleDateString(locale, {
                            weekday: "short",
                          })}
                        </span>
                      </time>
                      <span className="row-icon">
                        <StrengthIcon />
                      </span>
                      <div className="workout-card-main">
                        <Heading as="h3" size="3">
                          <RouterLink
                            className="title-link"
                            to={`/workouts/${workout.id}`}
                          >
                            {workout.title || t("workout")}
                          </RouterLink>
                        </Heading>
                        <Badge
                          color={workout.state === "ACTIVE" ? "teal" : "gray"}
                        >
                          {t(workout.state as MessageKey)}
                        </Badge>
                        <Text as="p" size="2" color="gray">
                          {names.length
                            ? `${names.slice(0, 3).join(" · ")}${names.length > 3 ? ` · +${names.length - 3}` : ""}`
                            : t("noSets")}
                        </Text>
                        {workout.notes ? (
                          <Text as="p" size="1" color="gray">
                            {t("notesAvailable")}: {workout.notes}
                          </Text>
                        ) : null}
                      </div>
                      <div className="workout-card-stats">
                        {workout.state === "COMPLETED" ? (
                          <>
                            <span>
                              {completed.length} {t("sets")}
                            </span>
                            <span>
                              {formatNumber(sumVolume(completed))} {t("volume")}
                            </span>
                          </>
                        ) : (
                          <>
                            <span>
                              {t("prescribedSets").replace(
                                "{count}",
                                String(workout.sets.length),
                              )}
                            </span>
                            <span>
                              {t("sessionProgress")
                                .replace(
                                  "{completed}",
                                  String(completed.length),
                                )
                                .replace(
                                  "{total}",
                                  String(workout.sets.length),
                                )}
                            </span>
                          </>
                        )}
                      </div>
                      <div className="card-actions">
                        {workout.state === "ACTIVE" ||
                        workout.state === "PAUSED" ? (
                          <Button highContrast asChild size="1" variant="soft">
                            <RouterLink to={`/workouts/${workout.id}`}>
                              {t("continueTraining")}
                            </RouterLink>
                          </Button>
                        ) : null}
                        {workout.state === "COMPLETED" ? (
                          <ActionForm action={duplicateWorkoutAction}>
                            <input
                              name="sourceWorkoutId"
                              type="hidden"
                              value={workout.id}
                            />
                            <input
                              name="date"
                              type="hidden"
                              value={formatDateKey(now)}
                            />
                            <SubmitButton size="1" variant="soft">
                              {t("repeatWorkout")}
                            </SubmitButton>
                          </ActionForm>
                        ) : null}
                        <Button highContrast asChild size="1" variant="ghost">
                          <RouterLink to={`/workouts/${workout.id}`}>
                            {t("view")}
                          </RouterLink>
                        </Button>
                      </div>
                    </article>
                  </Fragment>
                );
              })
            )}
            {totalPages > 1 ? (
              <nav className="pagination" aria-label={t("pagination")}>
                {currentPage > 1 ? (
                  <Button highContrast asChild variant="soft">
                    <RouterLink
                      to={workoutsHref(filters, { page: currentPage - 1 })}
                    >
                      {t("previous")}
                    </RouterLink>
                  </Button>
                ) : (
                  <Button highContrast variant="soft" disabled>
                    {t("previous")}
                  </Button>
                )}
                <span>
                  {t("page")} {currentPage} {t("of")} {totalPages}
                </span>
                {currentPage < totalPages ? (
                  <Button highContrast asChild variant="soft">
                    <RouterLink
                      to={workoutsHref(filters, { page: currentPage + 1 })}
                    >
                      {t("next")}
                    </RouterLink>
                  </Button>
                ) : (
                  <Button highContrast variant="soft" disabled>
                    {t("next")}
                  </Button>
                )}
              </nav>
            ) : null}
            {totalWorkoutCount > 0 ? (
              <Text as="p" size="1" color="gray">
                {t("volumeDefinition")}
              </Text>
            ) : null}
          </section>
        </Card>
        <aside className="workouts-sidebar stack">
          <WorkoutCalendar />
          {templates.length > 0 ? (
            <Card asChild>
              <section className="stack">
                <div className="section-heading">
                  <Heading as="h2" size="4">
                    {t("templates")}
                  </Heading>
                  <Badge color="gray">{templates.length}</Badge>
                </div>
                <div className="template-list">
                  {templates.map((template) => (
                    <article className="template-item" key={template.id}>
                      <div>
                        <Text weight="bold">{template.title}</Text>
                        <Text size="1" color="gray">
                          {template._count?.sets ?? 0} {t("sets")}
                        </Text>
                      </div>
                      <details>
                        <summary>{t("createFromTemplate")}</summary>
                        <ActionForm
                          className="form-grid compact-form"
                          action={createWorkoutFromTemplateAction}
                        >
                          <input
                            type="hidden"
                            name="templateId"
                            value={template.id}
                          />
                          <TextField.Root
                            aria-label={t("date")}
                            defaultValue={today}
                            name="date"
                            type="date"
                            required
                          />
                          <SubmitButton variant="soft">
                            {t("createFromTemplate")}
                          </SubmitButton>
                        </ActionForm>
                      </details>
                      <ConfirmDelete
                        action={deleteWorkoutTemplateAction}
                        fields={{ templateId: template.id }}
                        title={t("confirmDelete")}
                        description={t("deleteDescription")}
                        cancel={t("cancel")}
                        confirm={t("delete")}
                      />
                    </article>
                  ))}
                </div>
              </section>
            </Card>
          ) : totalWorkoutCount > 0 ? (
            <Text as="p" size="2" color="gray">
              {t("noTemplates")}
            </Text>
          ) : null}
        </aside>
      </div>
      <details className="dashboard-tools">
        <summary>{t("schedule")}</summary>
        <TemplatePlanning />
      </details>
    </section>
  );
}

function workoutsHref(
  filters: WorkoutFilters,
  overrides: Partial<WorkoutFilters>,
) {
  const next = { ...filters, ...overrides };
  const params = new URLSearchParams();

  if (next.q) {
    params.set("q", next.q);
  }
  if (next.month) {
    params.set("month", next.month);
  }
  if (next.exerciseId) {
    params.set("exercise", next.exerciseId);
  }
  if (next.notesOnly) {
    params.set("notes", "1");
  }
  if (next.page > 1) {
    params.set("page", String(next.page));
  }

  const query = params.toString();
  return query ? `/workouts?${query}` : "/workouts";
}
