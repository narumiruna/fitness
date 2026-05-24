import {
  createExerciseAction,
  createExerciseAliasAction,
} from "@/app/actions/exercises";
import { requireUser } from "@/lib/auth";
import { normalizeExerciseAlias } from "@/lib/exercises";
import { getDictionary } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";

export default async function ExercisesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireUser();
  const t = await getDictionary();
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const normalizedQuery = normalizeExerciseAlias(query);

  const exercises = await prisma.exercise.findMany({
    where: query
      ? {
          OR: [
            { defaultName: { contains: query } },
            {
              names: {
                some: {
                  name: { contains: query },
                },
              },
            },
            {
              aliases: {
                some: {
                  normalizedAlias: { contains: normalizedQuery },
                },
              },
            },
          ],
        }
      : undefined,
    include: {
      aliases: {
        orderBy: [{ locale: "asc" }, { alias: "asc" }],
      },
      names: {
        orderBy: [{ locale: "asc" }, { name: "asc" }],
      },
    },
    orderBy: { defaultName: "asc" },
  });

  return (
    <section className="stack">
      <div className="page-header">
        <div>
          <h1>{t("exercises")}</h1>
        </div>
      </div>
      <div className="grid">
        <div className="panel stack">
          <h2>{t("searchExercises")}</h2>
          <form className="form-grid" action="/exercises">
            <label>
              {t("search")}
              <input
                defaultValue={query}
                name="q"
                placeholder="deadlift or 硬舉"
              />
            </label>
            <button className="button" type="submit">
              {t("search")}
            </button>
          </form>
          <form className="form-grid" action={createExerciseAction}>
            <h2>{t("createExercise")}</h2>
            <label>
              {t("defaultName")}
              <input name="defaultName" placeholder="Overhead Press" required />
            </label>
            <button className="button" type="submit">
              {t("createExercise")}
            </button>
          </form>
        </div>
        <div className="stack">
          {exercises.map((exercise) => (
            <article className="item stack" key={exercise.id}>
              <div>
                <h2>{exercise.defaultName}</h2>
                <p className="muted">
                  {exercise.aliases
                    .map((alias) => `${alias.alias} (${alias.locale})`)
                    .join(", ") || t("aliases")}
                </p>
              </div>
              <form
                className="form-grid two"
                action={createExerciseAliasAction}
              >
                <input name="exerciseId" type="hidden" value={exercise.id} />
                <label>
                  {t("locale")}
                  <input defaultValue="zh-TW" name="locale" required />
                </label>
                <label>
                  {t("alias")}
                  <input name="alias" placeholder="硬舉" required />
                </label>
                <button className="button secondary" type="submit">
                  {t("addAlias")}
                </button>
              </form>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
