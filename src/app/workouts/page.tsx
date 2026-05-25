import Link from "next/link";
import { createWorkoutAction } from "@/app/actions/workouts";
import { requireUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";

export default async function WorkoutsPage() {
  const user = await requireUser();
  const t = await getDictionary();
  const workouts = await prisma.workout.findMany({
    where: { userId: user.id },
    include: {
      sets: true,
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const workoutsThisMonth = workouts.filter(
    (workout) =>
      workout.date >= currentMonthStart && workout.date < nextMonthStart,
  ).length;
  const totalSets = workouts.reduce(
    (total, workout) => total + workout.sets.length,
    0,
  );
  const latestWorkoutDate = workouts[0]?.date;

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
          value={formatInteger(workouts.length)}
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
            latestWorkoutDate
              ? latestWorkoutDate.toLocaleDateString("en", {
                  month: "short",
                  day: "numeric",
                })
              : t("noLatestWorkout")
          }
        />
      </section>

      <div className="workouts-layout">
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

        <section className="workouts-list stack">
          <div className="section-heading workout-list-heading">
            <h2>{t("recentWorkouts")}</h2>
            <span>{workouts.length}</span>
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
                    <Link
                      className="button secondary"
                      href={`/workouts/${workout.id}`}
                    >
                      {t("view")}
                    </Link>
                  </div>
                </article>
              );
            })
          )}
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

function formatInteger(value: number) {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 0,
  }).format(value);
}
