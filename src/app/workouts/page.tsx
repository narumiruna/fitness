import {
  Badge,
  Button,
  Card,
  Checkbox,
  Heading,
  Text,
  TextArea,
  TextField,
} from "@radix-ui/themes";
import NextLink from "next/link";
import {
  createWorkoutAction,
  createWorkoutFromTemplateAction,
  deleteWorkoutTemplateAction,
  duplicateWorkoutAction,
} from "@/app/actions/workouts";
import { FormSelect } from "@/components/form-select";
import type { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";

type WorkoutsPageProps = {
  searchParams: Promise<{
    exercise?: string | string[];
    month?: string | string[];
    notes?: string | string[];
    page?: string | string[];
    q?: string | string[];
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
  const today = formatDateInput(now);
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const workoutWhere = buildWorkoutWhere(user.id, filters);

  const [
    filteredWorkoutCount,
    totalWorkoutCount,
    workoutsThisMonth,
    totalSets,
    latestWorkout,
  ] = await Promise.all([
    prisma.workout.count({ where: workoutWhere }),
    prisma.workout.count({ where: { userId: user.id } }),
    prisma.workout.count({
      where: {
        userId: user.id,
        date: {
          gte: currentMonthStart,
          lt: nextMonthStart,
        },
      },
    }),
    prisma.workoutSet.count({
      where: {
        workout: { userId: user.id },
      },
    }),
    prisma.workout.findFirst({
      where: { userId: user.id },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      select: { date: true },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(filteredWorkoutCount / pageSize));
  const currentPage = Math.min(filters.page, totalPages);
  const [workouts, exerciseOptions, templates] = await Promise.all([
    prisma.workout.findMany({
      where: workoutWhere,
      include: {
        sets: {
          select: { exerciseId: true },
        },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
    }),
    prisma.exercise.findMany({
      where: {
        sets: {
          some: {
            workout: { userId: user.id },
          },
        },
      },
      orderBy: { defaultName: "asc" },
      select: { defaultName: true, id: true },
    }),
    prisma.workoutTemplate.findMany({
      where: { userId: user.id },
      include: {
        _count: {
          select: { sets: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return (
    <section className="stack workouts-page">
      <div className="page-header workouts-header">
        <div>
          <Heading as="h1" size="8">
            {t("workouts")}
          </Heading>
          <Text as="p" size="2" color="gray">
            {t("workoutsIntro")}
          </Text>
        </div>
      </div>

      <section className="workouts-summary-grid" aria-label={t("overview")}>
        <WorkoutSummaryCard
          label={t("totalWorkouts")}
          value={formatInteger(totalWorkoutCount)}
        />
        <WorkoutSummaryCard
          label={t("monthWorkouts")}
          value={formatInteger(workoutsThisMonth)}
        />
        <WorkoutSummaryCard
          label={t("totalSets")}
          value={formatInteger(totalSets)}
        />
        <WorkoutSummaryCard
          label={t("latestWorkout")}
          value={
            latestWorkout
              ? latestWorkout.date.toLocaleDateString("en", {
                  month: "short",
                  day: "numeric",
                })
              : t("noLatestWorkout")
          }
        />
      </section>

      <div className="workouts-layout">
        <aside className="workouts-sidebar stack">
          <Card asChild>
            <form
              action={createWorkoutAction}
              className="form-grid create-workout-card"
            >
              <Heading as="h2" size="5">
                {t("createWorkout")}
              </Heading>
              <Text as="label" size="2" weight="medium" className="field-label">
                {t("date")}
                <TextField.Root
                  defaultValue={today}
                  name="date"
                  required
                  type="date"
                />
              </Text>
              <Text as="label" size="2" weight="medium" className="field-label">
                {t("workoutTitle")}
                <TextField.Root
                  name="title"
                  placeholder={t("workoutTitlePlaceholder")}
                />
              </Text>
              <Text as="label" size="2" weight="medium" className="field-label">
                {t("notes")}
                <TextArea
                  aria-label={t("notes")}
                  name="notes"
                  placeholder={t("workoutNotesPlaceholder")}
                />
              </Text>
              <Button highContrast type="submit">
                {t("createWorkout")}
              </Button>
            </form>
          </Card>

          <Card asChild>
            <form action="/workouts" className="form-grid">
              <Heading as="h2" size="5">
                {t("filterWorkouts")}
              </Heading>
              <Text as="label" size="2" weight="medium" className="field-label">
                {t("search")}
                <TextField.Root
                  defaultValue={filters.q}
                  name="q"
                  placeholder={t("workoutSearchPlaceholder")}
                />
              </Text>
              <Text as="label" size="2" weight="medium" className="field-label">
                {t("month")}
                <TextField.Root
                  defaultValue={filters.month}
                  name="month"
                  type="month"
                />
              </Text>
              <Text as="label" size="2" weight="medium" className="field-label">
                {t("exercise")}
                <FormSelect
                  defaultValue={filters.exerciseId}
                  name="exercise"
                  key={filters.exerciseId}
                  label={t("exercise")}
                  options={[
                    { value: "", label: t("allExercises") },
                    ...exerciseOptions.map((exercise) => ({
                      value: exercise.id,
                      label: exercise.defaultName,
                    })),
                  ]}
                />
              </Text>
              <Text
                as="label"
                size="2"
                weight="medium"
                className="checkbox-label"
              >
                <Checkbox
                  defaultChecked={filters.notesOnly}
                  name="notes"
                  value="1"
                />
                {t("onlyWorkoutsWithNotes")}
              </Text>
              <div className="toolbar-actions">
                <Button highContrast type="submit">
                  {t("applyFilters")}
                </Button>
                <Button highContrast asChild variant="soft">
                  <NextLink href="/workouts">{t("clearFilters")}</NextLink>
                </Button>
              </div>
            </form>
          </Card>

          <Card asChild>
            <section className="stack">
              <div className="section-heading">
                <Heading as="h2" size="5">
                  {t("templates")}
                </Heading>
                <Badge color="gray">{templates.length}</Badge>
              </div>
              {templates.length === 0 ? (
                <Text as="p" size="2" color="gray">
                  {t("noTemplates")}
                </Text>
              ) : (
                <div className="template-list">
                  {templates.map((template) => (
                    <Card asChild key={template.id}>
                      <article className="template-item">
                        <div>
                          <Text weight="bold">{template.title}</Text>
                          <Text size="1" color="gray">
                            {template._count.sets}{" "}
                            {template._count.sets === 1 ? t("set") : t("sets")}
                          </Text>
                        </div>
                        <form
                          className="form-grid template-actions"
                          action={createWorkoutFromTemplateAction}
                        >
                          <input
                            name="templateId"
                            type="hidden"
                            value={template.id}
                          />
                          <TextField.Root
                            aria-label={t("date")}
                            defaultValue={today}
                            name="date"
                            required
                            type="date"
                          />
                          <Button highContrast variant="soft" type="submit">
                            {t("createFromTemplate")}
                          </Button>
                        </form>
                        <form action={deleteWorkoutTemplateAction}>
                          <input
                            name="templateId"
                            type="hidden"
                            value={template.id}
                          />
                          <Button
                            highContrast
                            color="red"
                            variant="soft"
                            type="submit"
                          >
                            {t("delete")}
                          </Button>
                        </form>
                      </article>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          </Card>
        </aside>

        <section className="workouts-list stack">
          <div className="section-heading workout-list-heading">
            <div>
              <Heading as="h2" size="5">
                {t("recentWorkouts")}
              </Heading>
              <Text as="p" size="2" color="gray">
                {t("showing")} {formatInteger(workouts.length)} {t("of")}{" "}
                {formatInteger(filteredWorkoutCount)}
              </Text>
            </div>
            <Badge color="gray">{filteredWorkoutCount}</Badge>
          </div>
          {workouts.length === 0 ? (
            <Card asChild>
              <div className="empty-state">
                <Text weight="bold">{t("noWorkouts")}</Text>
                <Text as="p" size="2" color="gray">
                  {t("workoutsIntro")}
                </Text>
              </div>
            </Card>
          ) : (
            workouts.map((workout) => {
              const exerciseCount = new Set(
                workout.sets.map((set) => set.exerciseId),
              ).size;

              return (
                <Card asChild key={workout.id}>
                  <article className="workout-card">
                    <div className="workout-card-body">
                      <div className="workout-card-main">
                        <Badge asChild color="gray">
                          <time dateTime={workout.date.toISOString()}>
                            {workout.date.toLocaleDateString("en")}
                          </time>
                        </Badge>
                        <Heading as="h2" size="5">
                          {workout.title || t("workout")}
                        </Heading>
                      </div>
                    </div>
                    <div className="workout-card-footer">
                      <div className="workout-card-stats">
                        <span>
                          <Text weight="bold">
                            {formatInteger(workout.sets.length)}
                          </Text>{" "}
                          {workout.sets.length === 1 ? t("set") : t("sets")}
                        </span>
                        <span>
                          <Text weight="bold">
                            {formatInteger(exerciseCount)}
                          </Text>{" "}
                          {exerciseCount === 1
                            ? t("exercise")
                            : t("exercisesMetric")}
                        </span>
                        {workout.notes ? (
                          <span>{t("notesAvailable")}</span>
                        ) : null}
                      </div>
                      <div className="card-actions">
                        <form action={duplicateWorkoutAction}>
                          <input
                            name="sourceWorkoutId"
                            type="hidden"
                            value={workout.id}
                          />
                          <input name="date" type="hidden" value={today} />
                          <Button highContrast variant="soft" type="submit">
                            {t("repeatWorkout")}
                          </Button>
                        </form>
                        <Button highContrast asChild variant="soft">
                          <NextLink href={`/workouts/${workout.id}`}>
                            {t("view")}
                          </NextLink>
                        </Button>
                      </div>
                    </div>
                  </article>
                </Card>
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
              <span className="pagination-status">
                {t("page")} {formatInteger(currentPage)} {t("of")}{" "}
                {formatInteger(totalPages)}
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
        </section>
      </div>
    </section>
  );
}

function WorkoutSummaryCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <Card asChild>
      <article className="workout-summary-card">
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
  return /^\d{4}-\d{2}$/.test(value ?? "");
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function positiveInteger(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function formatDateInput(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 0,
  }).format(value);
}
