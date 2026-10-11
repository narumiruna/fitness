import { PlusIcon, RowsIcon } from "@radix-ui/react-icons";
import {
  Badge,
  Button,
  Card,
  Heading,
  Text,
  TextArea,
  TextField,
} from "@radix-ui/themes";
import NextLink from "next/link";
import { Fragment } from "react";
import {
  createWorkoutAction,
  createWorkoutFromTemplateAction,
  deleteWorkoutTemplateAction,
  duplicateWorkoutAction,
} from "@/app/actions/workouts";
import { ConfirmDelete } from "@/components/confirm-delete";
import { EmptyState, MetricCard, PageHeader } from "@/components/dashboard";
import { FormSelect } from "@/components/form-select";
import { NotesCheckbox } from "@/components/notes-checkbox";
import { SubmitButton } from "@/components/submit-button";
import { TemplatePlanning } from "@/components/template-planning";
import type { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { formatDateKey, parseDateKey } from "@/lib/calendar";
import { getDictionary } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { sumVolume } from "@/lib/stats-calculations";

type WorkoutsPageProps = {
  searchParams: Promise<{
    exercise?: string | string[];
    month?: string | string[];
    notes?: string | string[];
    page?: string | string[];
    q?: string | string[];
    date?: string | string[];
  }>;
};
type WorkoutFilters = {
  exerciseId: string;
  month: string;
  notesOnly: boolean;
  page: number;
  q: string;
};
const pageSize = 20;

export default async function WorkoutsPage({
  searchParams,
}: WorkoutsPageProps) {
  const user = await requireUser();
  const t = await getDictionary();
  const params = await searchParams;
  const filters = resolveWorkoutFilters(params);
  const now = new Date();
  const today = formatDateKey(parseDateKey(firstParam(params.date)) ?? now);
  const workoutWhere = buildWorkoutWhere(user.id, filters);
  const [filteredWorkoutCount, totalWorkoutCount, workoutsThisMonth, totals] =
    await Promise.all([
      prisma.workout.count({ where: workoutWhere }),
      prisma.workout.count({ where: { userId: user.id, state: "COMPLETED" } }),
      prisma.workout.count({
        where: {
          userId: user.id,
          state: "COMPLETED",
          date: {
            gte: new Date(now.getFullYear(), now.getMonth(), 1),
            lt: new Date(now.getFullYear(), now.getMonth() + 1, 1),
          },
        },
      }),
      prisma.$queryRaw<{ count: bigint | number; volume: number }[]>`
        SELECT COUNT(*) AS count, COALESCE(SUM(s.weight * s.reps), 0) AS volume
        FROM "WorkoutSet" AS s
        JOIN "Workout" AS w ON w.id = s."workoutId"
        WHERE w."userId" = ${user.id} AND w.state = 'COMPLETED' AND s.completed = true
      `,
    ]);
  const totalPages = Math.max(1, Math.ceil(filteredWorkoutCount / pageSize));
  const currentPage = Math.min(filters.page, totalPages);
  const [workouts, exerciseOptions, templates] = await Promise.all([
    prisma.workout.findMany({
      where: workoutWhere,
      include: {
        sets: {
          where: { completed: true, workout: { state: "COMPLETED" } },
          include: { exercise: true },
          orderBy: { order: "asc" },
        },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
    }),
    prisma.exercise.findMany({
      where: { sets: { some: { workout: { userId: user.id } } } },
      orderBy: { defaultName: "asc" },
      select: { id: true, defaultName: true },
    }),
    prisma.workoutTemplate.findMany({
      where: { userId: user.id },
      include: { _count: { select: { sets: true } } },
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  return (
    <section className="stack workouts-page">
      <TemplatePlanning userId={user.id} />
      <PageHeader title={t("workouts")} description={t("workoutsIntro")}>
        <Button highContrast asChild>
          <a href="#new-workout">
            <PlusIcon aria-hidden="true" />
            {t("newWorkoutAction")}
          </a>
        </Button>
      </PageHeader>
      {totalWorkoutCount > 0 ? (
        <section className="workouts-summary-grid" aria-label={t("overview")}>
          <MetricCard
            label={t("totalWorkouts")}
            value={formatInteger(totalWorkoutCount)}
          />
          <MetricCard
            label={t("totalVolume")}
            value={formatNumber(totals[0].volume)}
          />
          <MetricCard
            label={t("totalSets")}
            value={formatInteger(Number(totals[0].count))}
          />
          <MetricCard
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
            {totalWorkoutCount > 0 ? (
              <form
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
                    <NextLink href="/workouts">{t("clearFilters")}</NextLink>
                  </Button>
                </div>
              </form>
            ) : null}
            {workouts.length === 0 ? (
              <EmptyState
                title={t(totalWorkoutCount ? "noWorkoutResults" : "noWorkouts")}
                description={t("workoutsIntro")}
              />
            ) : (
              workouts.map((workout, index) => {
                const month = workout.date.toLocaleDateString("en", {
                  month: "long",
                  year: "numeric",
                });
                const previous = workouts[index - 1]?.date.toLocaleDateString(
                  "en",
                  { month: "long", year: "numeric" },
                );
                const names = [
                  ...new Set(workout.sets.map((s) => s.exercise.defaultName)),
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
                          {workout.date.toLocaleDateString("en", {
                            month: "short",
                          })}
                        </span>
                        <strong>{workout.date.getDate()}</strong>
                        <span>
                          {workout.date.toLocaleDateString("en", {
                            weekday: "short",
                          })}
                        </span>
                      </time>
                      <span className="row-icon">
                        <RowsIcon aria-hidden="true" />
                      </span>
                      <div className="workout-card-main">
                        <Heading as="h3" size="3">
                          <NextLink
                            className="title-link"
                            href={`/workouts/${workout.id}`}
                          >
                            {workout.title || t("workout")}
                          </NextLink>
                        </Heading>
                        <Text as="p" size="2" color="gray">
                          {names.length ? names.join(" · ") : t("noSets")}
                        </Text>
                        {workout.notes ? (
                          <Text as="p" size="1" color="gray">
                            {t("notesAvailable")}: {workout.notes}
                          </Text>
                        ) : null}
                      </div>
                      <div className="workout-card-stats">
                        <span>
                          {workout.sets.length} {t("sets")}
                        </span>
                        <span>
                          {formatNumber(sumVolume(workout.sets))} {t("volume")}
                        </span>
                      </div>
                      <div className="card-actions">
                        {workout.state === "COMPLETED" ? (
                          <form action={duplicateWorkoutAction}>
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
                          </form>
                        ) : null}
                        <Button highContrast asChild size="1" variant="ghost">
                          <NextLink href={`/workouts/${workout.id}`}>
                            {t("view")}
                          </NextLink>
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
                    <NextLink
                      href={workoutsHref(filters, { page: currentPage - 1 })}
                    >
                      {t("previous")}
                    </NextLink>
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
                    <NextLink
                      href={workoutsHref(filters, { page: currentPage + 1 })}
                    >
                      {t("next")}
                    </NextLink>
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
          <Card asChild>
            <form
              id="new-workout"
              action={createWorkoutAction}
              className="form-grid create-workout-card"
            >
              <Heading as="h2" size="4">
                {t("createWorkout")}
              </Heading>
              <Text as="label" size="2" className="field-label">
                {t("date")}
                <TextField.Root
                  key={today}
                  defaultValue={today}
                  name="date"
                  required
                  type="date"
                />
              </Text>
              <Text as="label" size="2" className="field-label">
                {t("workoutTitle")}
                <TextField.Root
                  name="title"
                  maxLength={120}
                  placeholder={t("workoutTitlePlaceholder")}
                />
              </Text>
              <Text as="label" size="2" className="field-label">
                {t("notes")}
                <TextArea
                  name="notes"
                  maxLength={2000}
                  placeholder={t("workoutNotesPlaceholder")}
                />
              </Text>
              <SubmitButton>{t("createWorkout")}</SubmitButton>
            </form>
          </Card>
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
                          {template._count.sets} {t("sets")}
                        </Text>
                      </div>
                      <details>
                        <summary>{t("createFromTemplate")}</summary>
                        <form
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
                        </form>
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
    </section>
  );
}

function buildWorkoutWhere(userId: string, filters: WorkoutFilters) {
  const and: Prisma.WorkoutWhereInput[] = [];
  const monthRange = parseMonthRange(filters.month);

  if (filters.q) {
    and.push({
      OR: [
        { title: { contains: filters.q } },
        { notes: { contains: filters.q } },
      ],
    });
  }

  if (monthRange) {
    and.push({
      date: {
        gte: monthRange.start,
        lt: monthRange.end,
      },
    });
  }

  if (filters.exerciseId) {
    and.push({
      sets: {
        some: {
          exerciseId: filters.exerciseId,
        },
      },
    });
  }

  if (filters.notesOnly) {
    and.push({ notes: { not: null } });
    and.push({ notes: { not: "" } });
  }

  return {
    userId,
    ...(and.length > 0 ? { AND: and } : {}),
  } satisfies Prisma.WorkoutWhereInput;
}

function resolveWorkoutFilters(
  params: Awaited<WorkoutsPageProps["searchParams"]>,
): WorkoutFilters {
  const month = firstParam(params.month);

  return {
    exerciseId: firstParam(params.exercise)?.trim() ?? "",
    month: isMonthInput(month) ? month : "",
    notesOnly: firstParam(params.notes) === "1",
    page: positiveInteger(firstParam(params.page)) ?? 1,
    q: firstParam(params.q)?.trim() ?? "",
  };
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

function parseMonthRange(value: string) {
  if (!isMonthInput(value)) {
    return undefined;
  }

  const [year, month] = value.split("-").map(Number);
  return {
    start: new Date(year, month - 1, 1),
    end: new Date(year, month, 1),
  };
}

function isMonthInput(value: string | undefined): value is string {
  return (
    !!value && /^\d{4}-\d{2}$/.test(value) && !!parseDateKey(`${value}-01`)
  );
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function positiveInteger(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(
    value,
  );
}
