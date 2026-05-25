import Link from "next/link";
import {
  createWorkoutAction,
  createWorkoutFromTemplateAction,
  deleteWorkoutTemplateAction,
  duplicateWorkoutAction,
} from "@/app/actions/workouts";
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
          <h1>{t("workouts")}</h1>
          <p>{t("workoutsIntro")}</p>
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
          <form
            className="panel form-grid create-workout-card"
            action={createWorkoutAction}
          >
            <h2>{t("createWorkout")}</h2>
            <label>
              {t("date")}
              <input defaultValue={today} name="date" required type="date" />
            </label>
            <label>
              {t("workoutTitle")}
              <input name="title" placeholder="Lower body" />
            </label>
            <label>
              {t("notes")}
              <textarea name="notes" placeholder="How did it feel?" />
            </label>
            <button className="button" type="submit">
              {t("createWorkout")}
            </button>
          </form>

          <form className="panel form-grid" action="/workouts">
            <h2>{t("filterWorkouts")}</h2>
            <label>
              {t("search")}
              <input
                defaultValue={filters.q}
                name="q"
                placeholder="title or notes"
              />
            </label>
            <label>
              {t("month")}
              <input defaultValue={filters.month} name="month" type="month" />
            </label>
            <label>
              {t("exercise")}
              <select defaultValue={filters.exerciseId} name="exercise">
                <option value="">{t("allExercises")}</option>
                {exerciseOptions.map((exercise) => (
                  <option key={exercise.id} value={exercise.id}>
                    {exercise.defaultName}
                  </option>
                ))}
              </select>
            </label>
            <label className="checkbox-label">
              <input
                defaultChecked={filters.notesOnly}
                name="notes"
                type="checkbox"
                value="1"
              />
              {t("onlyWorkoutsWithNotes")}
            </label>
            <div className="toolbar-actions">
              <button className="button" type="submit">
                {t("applyFilters")}
              </button>
              <Link className="button secondary" href="/workouts">
                {t("clearFilters")}
              </Link>
            </div>
          </form>

          <section className="panel stack">
            <div className="section-heading">
              <h2>{t("templates")}</h2>
              <span>{templates.length}</span>
            </div>
            {templates.length === 0 ? (
              <p className="muted">{t("noTemplates")}</p>
            ) : (
              <div className="template-list">
                {templates.map((template) => (
                  <article className="template-item" key={template.id}>
                    <div>
                      <strong>{template.title}</strong>
                      <small>
                        {template._count.sets}{" "}
                        {template._count.sets === 1 ? t("set") : t("sets")}
                      </small>
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
                      <input
                        aria-label={t("date")}
                        defaultValue={today}
                        name="date"
                        required
                        type="date"
                      />
                      <button className="button secondary" type="submit">
                        {t("createFromTemplate")}
                      </button>
                    </form>
                    <form action={deleteWorkoutTemplateAction}>
                      <input
                        name="templateId"
                        type="hidden"
                        value={template.id}
                      />
                      <button className="link-button danger-link" type="submit">
                        {t("delete")}
                      </button>
                    </form>
                  </article>
                ))}
              </div>
            )}
          </section>
        </aside>

        <section className="workouts-list stack">
          <div className="section-heading workout-list-heading">
            <div>
              <h2>{t("recentWorkouts")}</h2>
              <p className="muted">
                {t("showing")} {formatInteger(workouts.length)} {t("of")}{" "}
                {formatInteger(filteredWorkoutCount)}
              </p>
            </div>
            <span>{filteredWorkoutCount}</span>
          </div>
          {workouts.length === 0 ? (
            <div className="empty-state">
              <strong>{t("noWorkouts")}</strong>
              <p className="muted">{t("workoutsIntro")}</p>
            </div>
          ) : (
            workouts.map((workout) => {
              const exerciseCount = new Set(
                workout.sets.map((set) => set.exerciseId),
              ).size;

              return (
                <article className="item workout-card" key={workout.id}>
                  <div className="workout-card-body">
                    <div className="workout-card-main">
                      <time
                        className="meta-pill"
                        dateTime={workout.date.toISOString()}
                      >
                        {workout.date.toLocaleDateString("en")}
                      </time>
                      <h2>{workout.title || t("workout")}</h2>
                    </div>
                  </div>
                  <div className="workout-card-footer">
                    <div className="workout-card-stats">
                      <span>
                        <strong>{formatInteger(workout.sets.length)}</strong>{" "}
                        {workout.sets.length === 1 ? t("set") : t("sets")}
                      </span>
                      <span>
                        <strong>{formatInteger(exerciseCount)}</strong>{" "}
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
                        <button className="button secondary" type="submit">
                          {t("repeatWorkout")}
                        </button>
                      </form>
                      <Link
                        className="button secondary"
                        href={`/workouts/${workout.id}`}
                      >
                        {t("view")}
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })
          )}

          {totalPages > 1 ? (
            <nav className="pagination" aria-label={t("pagination")}>
              {currentPage > 1 ? (
                <Link
                  className="button secondary"
                  href={workoutsHref(filters, { page: currentPage - 1 })}
                >
                  {t("previous")}
                </Link>
              ) : (
                <span className="button secondary disabled">
                  {t("previous")}
                </span>
              )}
              <span className="pagination-status">
                {t("page")} {formatInteger(currentPage)} {t("of")}{" "}
                {formatInteger(totalPages)}
              </span>
              {currentPage < totalPages ? (
                <Link
                  className="button secondary"
                  href={workoutsHref(filters, { page: currentPage + 1 })}
                >
                  {t("next")}
                </Link>
              ) : (
                <span className="button secondary disabled">{t("next")}</span>
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
    <article className="item workout-summary-card">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </article>
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
