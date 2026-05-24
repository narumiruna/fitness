import { notFound } from "next/navigation";
import {
  createWorkoutSetAction,
  deleteWorkoutAction,
  deleteWorkoutSetAction,
} from "@/app/actions/workouts";
import { requireUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";

export default async function WorkoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const t = await getDictionary();
  const { id } = await params;
  const workout = await prisma.workout.findFirst({
    where: {
      id,
      userId: user.id,
    },
    include: {
      sets: {
        include: {
          exercise: true,
        },
        orderBy: { order: "asc" },
      },
    },
  });

  if (!workout) {
    notFound();
  }

  const exercises = await prisma.exercise.findMany({
    orderBy: { defaultName: "asc" },
  });
  const nextOrder =
    workout.sets.reduce((max, set) => Math.max(max, set.order), 0) + 1;

  return (
    <section className="stack">
      <div className="page-header">
        <div>
          <h1>{workout.title || "Workout"}</h1>
          <p>{workout.date.toLocaleDateString("en")}</p>
        </div>
        <form action={deleteWorkoutAction}>
          <input name="workoutId" type="hidden" value={workout.id} />
          <button className="button danger" type="submit">
            {t("delete")}
          </button>
        </form>
      </div>
      {workout.notes ? <p className="panel">{workout.notes}</p> : null}
      <div className="grid">
        <div className="panel stack">
          <h2>{t("addSet")}</h2>
          <form className="form-grid" action={createWorkoutSetAction}>
            <input name="workoutId" type="hidden" value={workout.id} />
            <label>
              {t("exercise")}
              <select name="exerciseId" required>
                {exercises.map((exercise) => (
                  <option key={exercise.id} value={exercise.id}>
                    {exercise.defaultName}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-grid two">
              <label>
                {t("weight")}
                <input
                  min="0"
                  name="weight"
                  required
                  step="0.5"
                  type="number"
                />
              </label>
              <label>
                {t("reps")}
                <input min="1" name="reps" required type="number" />
              </label>
              <label>
                {t("order")}
                <input
                  min="1"
                  name="order"
                  required
                  type="number"
                  defaultValue={nextOrder}
                />
              </label>
            </div>
            <label>
              {t("notes")}
              <textarea name="notes" />
            </label>
            <button className="button" type="submit">
              {t("addSet")}
            </button>
          </form>
        </div>
        <div className="panel stack">
          <div className="section-heading">
            <h2>{t("setsMetric")}</h2>
            <span>{workout.sets.length}</span>
          </div>

          {workout.sets.length === 0 ? (
            <p className="muted">{t("noSets")}</p>
          ) : (
            <>
              <div className="mobile-list">
                {workout.sets.map((set) => (
                  <article className="detail-list-item" key={set.id}>
                    <div className="detail-list-header">
                      <div>
                        <span className="meta-pill">#{set.order}</span>
                        <h3>{set.exercise.defaultName}</h3>
                      </div>
                      <form action={deleteWorkoutSetAction}>
                        <input
                          name="workoutId"
                          type="hidden"
                          value={workout.id}
                        />
                        <input name="setId" type="hidden" value={set.id} />
                        <button className="button danger" type="submit">
                          {t("delete")}
                        </button>
                      </form>
                    </div>
                    <div className="detail-pairs two">
                      <span>
                        <small>{t("weight")}</small>
                        <strong>{set.weight}</strong>
                      </span>
                      <span>
                        <small>{t("reps")}</small>
                        <strong>{set.reps}</strong>
                      </span>
                    </div>
                    {set.notes ? <p className="muted">{set.notes}</p> : null}
                  </article>
                ))}
              </div>

              <div className="table-scroll desktop-table">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t("order")}</th>
                      <th>{t("exercise")}</th>
                      <th>{t("weight")}</th>
                      <th>{t("reps")}</th>
                      <th>{t("notes")}</th>
                      <th>{t("delete")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workout.sets.map((set) => (
                      <tr key={set.id}>
                        <td>{set.order}</td>
                        <td>{set.exercise.defaultName}</td>
                        <td>{set.weight}</td>
                        <td>{set.reps}</td>
                        <td>{set.notes}</td>
                        <td>
                          <form action={deleteWorkoutSetAction}>
                            <input
                              name="workoutId"
                              type="hidden"
                              value={workout.id}
                            />
                            <input name="setId" type="hidden" value={set.id} />
                            <button className="button danger" type="submit">
                              {t("delete")}
                            </button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
