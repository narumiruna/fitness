import Link from "next/link";
import { notFound } from "next/navigation";
import {
  createWorkoutSetAction,
  deleteWorkoutAction,
  deleteWorkoutSetAction,
  duplicateWorkoutAction,
  saveWorkoutTemplateAction,
  updateWorkoutAction,
  updateWorkoutSetAction,
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
  const today = formatDateInput(new Date());
  const workoutDate = formatDateInput(workout.date);
  const nextOrder =
    workout.sets.reduce((max, set) => Math.max(max, set.order), 0) + 1;
  const totalReps = workout.sets.reduce((total, set) => total + set.reps, 0);
  const totalVolume = workout.sets.reduce(
    (total, set) => total + set.weight * set.reps,
    0,
  );
  const exerciseCount = new Set(workout.sets.map((set) => set.exerciseId)).size;

  return (
    <section className="stack">
      <div className="page-header">
        <div>
          <h1>{workout.title || t("workout")}</h1>
          <p>{workout.date.toLocaleDateString("en")}</p>
        </div>
        <div className="card-actions">
          <form action={duplicateWorkoutAction}>
            <input name="sourceWorkoutId" type="hidden" value={workout.id} />
            <input name="date" type="hidden" value={today} />
            <button className="button secondary" type="submit">
              {t("repeatWorkout")}
            </button>
          </form>
          <form action={deleteWorkoutAction}>
            <input name="workoutId" type="hidden" value={workout.id} />
            <button className="button danger" type="submit">
              {t("delete")}
            </button>
          </form>
        </div>
      </div>

      <section className="stats-card-grid" aria-label={t("overview")}>
        <SummaryCard
          label={t("totalSets")}
          value={formatInteger(workout.sets.length)}
        />
        <SummaryCard label={t("totalReps")} value={formatInteger(totalReps)} />
        <SummaryCard
          label={t("totalVolume")}
          value={formatNumber(totalVolume)}
        />
        <SummaryCard
          label={t("exercisesMetric")}
          value={formatInteger(exerciseCount)}
        />
      </section>

      {workout.notes ? <p className="panel">{workout.notes}</p> : null}

      <div className="grid">
        <div className="stack">
          <form className="panel form-grid" action={updateWorkoutAction}>
            <h2>{t("editWorkout")}</h2>
            <input name="workoutId" type="hidden" value={workout.id} />
            <label>
              {t("date")}
              <input
                defaultValue={workoutDate}
                name="date"
                required
                type="date"
              />
            </label>
            <label>
              {t("workoutTitle")}
              <input defaultValue={workout.title ?? ""} name="title" />
            </label>
            <label>
              {t("notes")}
              <textarea defaultValue={workout.notes ?? ""} name="notes" />
            </label>
            <button className="button" type="submit">
              {t("updateWorkout")}
            </button>
          </form>

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

          <form className="panel form-grid" action={saveWorkoutTemplateAction}>
            <h2>{t("saveAsTemplate")}</h2>
            <input name="workoutId" type="hidden" value={workout.id} />
            <label>
              {t("templateName")}
              <input
                defaultValue={workout.title || t("workout")}
                name="title"
                required
              />
            </label>
            <button className="button secondary" type="submit">
              {t("saveAsTemplate")}
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
                    <form className="form-grid" action={updateWorkoutSetAction}>
                      <input
                        name="workoutId"
                        type="hidden"
                        value={workout.id}
                      />
                      <input name="setId" type="hidden" value={set.id} />
                      <div className="detail-list-header">
                        <div>
                          <span className="meta-pill">#{set.order}</span>
                          <h3>
                            <Link href={`/exercises/${set.exercise.id}`}>
                              {set.exercise.defaultName}
                            </Link>
                          </h3>
                        </div>
                      </div>
                      <label>
                        {t("exercise")}
                        <select
                          defaultValue={set.exerciseId}
                          name="exerciseId"
                          required
                        >
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
                            defaultValue={set.weight}
                            min="0"
                            name="weight"
                            required
                            step="0.5"
                            type="number"
                          />
                        </label>
                        <label>
                          {t("reps")}
                          <input
                            defaultValue={set.reps}
                            min="1"
                            name="reps"
                            required
                            type="number"
                          />
                        </label>
                        <label>
                          {t("order")}
                          <input
                            defaultValue={set.order}
                            min="1"
                            name="order"
                            required
                            type="number"
                          />
                        </label>
                      </div>
                      <label>
                        {t("notes")}
                        <textarea defaultValue={set.notes ?? ""} name="notes" />
                      </label>
                      <button className="button secondary" type="submit">
                        {t("updateSet")}
                      </button>
                    </form>
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
                  </article>
                ))}
              </div>

              <div className="table-scroll desktop-table">
                <table className="table editable-table">
                  <thead>
                    <tr>
                      <th>{t("order")}</th>
                      <th>{t("exercise")}</th>
                      <th>{t("weight")}</th>
                      <th>{t("reps")}</th>
                      <th>{t("notes")}</th>
                      <th>{t("actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workout.sets.map((set) => {
                      const formId = `edit-set-${set.id}`;

                      return (
                        <tr key={set.id}>
                          <td>
                            <input
                              defaultValue={set.order}
                              form={formId}
                              min="1"
                              name="order"
                              required
                              type="number"
                            />
                          </td>
                          <td>
                            <select
                              defaultValue={set.exerciseId}
                              form={formId}
                              name="exerciseId"
                              required
                            >
                              {exercises.map((exercise) => (
                                <option key={exercise.id} value={exercise.id}>
                                  {exercise.defaultName}
                                </option>
                              ))}
                            </select>
                            <Link
                              className="table-link"
                              href={`/exercises/${set.exercise.id}`}
                            >
                              {t("history")}
                            </Link>
                          </td>
                          <td>
                            <input
                              defaultValue={set.weight}
                              form={formId}
                              min="0"
                              name="weight"
                              required
                              step="0.5"
                              type="number"
                            />
                          </td>
                          <td>
                            <input
                              defaultValue={set.reps}
                              form={formId}
                              min="1"
                              name="reps"
                              required
                              type="number"
                            />
                          </td>
                          <td>
                            <input
                              defaultValue={set.notes ?? ""}
                              form={formId}
                              name="notes"
                            />
                          </td>
                          <td>
                            <div className="table-actions">
                              <form id={formId} action={updateWorkoutSetAction}>
                                <input
                                  name="workoutId"
                                  type="hidden"
                                  value={workout.id}
                                />
                                <input
                                  name="setId"
                                  type="hidden"
                                  value={set.id}
                                />
                                <button
                                  className="button secondary"
                                  type="submit"
                                >
                                  {t("save")}
                                </button>
                              </form>
                              <form action={deleteWorkoutSetAction}>
                                <input
                                  name="workoutId"
                                  type="hidden"
                                  value={workout.id}
                                />
                                <input
                                  name="setId"
                                  type="hidden"
                                  value={set.id}
                                />
                                <button className="button danger" type="submit">
                                  {t("delete")}
                                </button>
                              </form>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
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

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="item stats-card">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </article>
  );
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

function formatNumber(value: number) {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 1,
  }).format(value);
}
