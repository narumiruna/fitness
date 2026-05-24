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
    orderBy: { date: "desc" },
  });
  const today = new Date().toISOString().slice(0, 10);

  return (
    <section className="stack">
      <div className="page-header">
        <div>
          <h1>{t("workouts")}</h1>
        </div>
      </div>
      <div className="grid">
        <form className="panel form-grid" action={createWorkoutAction}>
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
        <div className="stack">
          <div className="section-heading">
            <h2>{t("workouts")}</h2>
            <span>{workouts.length}</span>
          </div>
          {workouts.length === 0 ? (
            <div className="item muted">{t("noWorkouts")}</div>
          ) : (
            workouts.map((workout) => (
              <article className="item workout-card" key={workout.id}>
                <div className="workout-card-body">
                  <div>
                    <time
                      className="meta-pill"
                      dateTime={workout.date.toISOString()}
                    >
                      {workout.date.toLocaleDateString("en")}
                    </time>
                    <h2>{workout.title || t("workout")}</h2>
                  </div>
                  <span className="meta-pill">
                    {workout.sets.length}{" "}
                    {workout.sets.length === 1 ? t("set") : t("sets")}
                  </span>
                </div>
                <div className="row">
                  <Link
                    className="button secondary"
                    href={`/workouts/${workout.id}`}
                  >
                    {t("view")}
                  </Link>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
