import Link from "next/link";
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
  searchParams: Promise<{ created?: string; q?: string }>;
}) {
  await requireUser();
  const t = await getDictionary();
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const createdExerciseId = params.created?.trim() ?? "";
  const normalizedQuery = normalizeExerciseAlias(query);

  const [exercises, totalExerciseCount, totalAliasCount, usedExerciseCount] =
    await Promise.all([
      prisma.exercise.findMany({
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
          _count: {
            select: {
              aliases: true,
              sets: true,
            },
          },
          aliases: {
            orderBy: [{ locale: "asc" }, { alias: "asc" }],
          },
        },
        orderBy: { defaultName: "asc" },
      }),
      prisma.exercise.count(),
      prisma.exerciseAlias.count(),
      prisma.exercise.count({
        where: {
          sets: {
            some: {},
          },
        },
      }),
    ]);

  return (
    <section className="stack exercises-page">
      <div className="page-header">
        <div>
          <h1>{t("exercises")}</h1>
          <p>{t("exercisePageIntro")}</p>
        </div>
      </div>

      <section className="stats-card-grid" aria-label={t("overview")}>
        <SummaryCard
          label={t("totalExercises")}
          value={formatInteger(totalExerciseCount)}
        />
        <SummaryCard
          label={t("usedExercises")}
          value={formatInteger(usedExerciseCount)}
        />
        <SummaryCard
          label={t("aliases")}
          value={formatInteger(totalAliasCount)}
        />
        <SummaryCard
          label={query ? t("results") : t("showing")}
          value={formatInteger(exercises.length)}
        />
      </section>

      <div className="exercise-toolbar">
        <div className="panel stack">
          <div className="section-heading">
            <h2>{t("searchExercises")}</h2>
          </div>
          <form className="form-grid" action="/exercises">
            <label>
              {t("search")}
              <input
                defaultValue={query}
                name="q"
                placeholder="deadlift or 硬舉"
              />
            </label>
            <div className="toolbar-actions">
              <button className="button" type="submit">
                {t("search")}
              </button>
              {query ? (
                <Link className="button secondary" href="/exercises">
                  {t("clearSearch")}
                </Link>
              ) : null}
            </div>
          </form>
        </div>

        <form className="panel form-grid" action={createExerciseAction}>
          <div className="section-heading">
            <h2>{t("createExercise")}</h2>
          </div>
          <label>
            {t("defaultName")}
            <input name="defaultName" placeholder="Overhead Press" required />
          </label>
          <button className="button" type="submit">
            {t("createExercise")}
          </button>
        </form>
      </div>

      <section className="panel stack">
        <div className="section-heading">
          <div>
            <h2>{query ? t("exerciseResults") : t("exerciseLibrary")}</h2>
            <p className="muted">
              {query ? `${t("search")}: ${query}` : t("exerciseLibraryIntro")}
            </p>
          </div>
          <span>{exercises.length}</span>
        </div>

        {exercises.length === 0 ? (
          <div className="empty-state">
            <strong>{t("noExerciseResults")}</strong>
            <p className="muted">{t("noExerciseResultsHint")}</p>
          </div>
        ) : (
          <>
            <div className="exercise-list-header">
              <span>{t("exercise")}</span>
              <span>{t("aliases")}</span>
              <span>{t("actions")}</span>
            </div>
            <div className="exercise-list">
              {exercises.map((exercise) => (
                <article
                  className={[
                    "exercise-row",
                    exercise.id === createdExerciseId ? "highlight" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  key={exercise.id}
                >
                  <div className="exercise-row-main">
                    <div className="exercise-title-row">
                      <div>
                        <h3>{exercise.defaultName}</h3>
                        <div className="meta-row">
                          <span className="meta-pill">
                            {exercise._count.sets}{" "}
                            {exercise._count.sets === 1 ? t("set") : t("sets")}
                          </span>
                          <span className="meta-pill">
                            {exercise._count.aliases} {t("aliases")}
                          </span>
                        </div>
                      </div>
                      {exercise.id === createdExerciseId ? (
                        <span className="meta-pill">{t("newExercise")}</span>
                      ) : null}
                    </div>
                  </div>

                  {exercise.aliases.length > 0 ? (
                    <div className="alias-list">
                      {exercise.aliases.map((alias) => (
                        <span className="alias-chip" key={alias.id}>
                          {alias.alias}
                          <small>{alias.locale}</small>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="muted">{t("noAliases")}</p>
                  )}

                  <details className="inline-disclosure">
                    <summary>{t("addAlias")}</summary>
                    <form
                      className="form-grid two compact-form"
                      action={createExerciseAliasAction}
                    >
                      <input
                        name="exerciseId"
                        type="hidden"
                        value={exercise.id}
                      />
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
                  </details>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
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

function formatInteger(value: number) {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 0,
  }).format(value);
}
