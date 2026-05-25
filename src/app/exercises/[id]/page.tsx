import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { requireUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";

export default async function ExerciseHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const t = await getDictionary();
  const { id } = await params;
  const exercise = await prisma.exercise.findUnique({
    where: { id },
    include: {
      aliases: {
        orderBy: [{ locale: "asc" }, { alias: "asc" }],
      },
    },
  });

  if (!exercise) {
    notFound();
  }

  const workouts = await prisma.workout.findMany({
    where: {
      userId: user.id,
      sets: {
        some: { exerciseId: id },
      },
    },
    include: {
      sets: {
        where: { exerciseId: id },
        orderBy: { order: "asc" },
      },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  const setEntries = workouts.flatMap((workout) =>
    workout.sets.map((set) => ({ ...set, workout })),
  );
  const totalSets = setEntries.length;
  const totalReps = setEntries.reduce((total, set) => total + set.reps, 0);
  const totalVolume = setEntries.reduce(
    (total, set) => total + set.weight * set.reps,
    0,
  );
  const maxWeight = maxBy(setEntries, (set) => set.weight);
  const maxReps = maxBy(setEntries, (set) => set.reps);
  const monthlyTrend = buildMonthlyTrend(setEntries);
  const maxMonthlyVolume = Math.max(
    ...monthlyTrend.map((month) => month.volume),
    1,
  );

  return (
    <section className="stack">
      <div className="page-header">
        <div>
          <h1>{exercise.defaultName}</h1>
          <p>{t("exerciseHistoryIntro")}</p>
        </div>
      </div>

      <section className="stats-card-grid" aria-label={t("overview")}>
        <SummaryCard label={t("totalSets")} value={formatInteger(totalSets)} />
        <SummaryCard label={t("totalReps")} value={formatInteger(totalReps)} />
        <SummaryCard
          label={t("totalVolume")}
          value={formatNumber(totalVolume)}
        />
        <SummaryCard
          label={t("maxWeight")}
          value={
            maxWeight ? formatNumber(maxWeight.weight) : t("noLatestWorkout")
          }
        />
        <SummaryCard
          label={t("maxReps")}
          value={maxReps ? formatInteger(maxReps.reps) : t("noLatestWorkout")}
        />
      </section>

      <div className="grid">
        <section className="panel stack">
          <div className="stats-section-header">
            <h2>{t("monthlyTrend")}</h2>
            <p>{t("monthlyTrendIntro")}</p>
          </div>
          <div className="stats-bars">
            {monthlyTrend.map((month) => (
              <div className="stats-bar-row" key={month.key}>
                <span className="stats-bar-label">{month.label}</span>
                <span className="stats-bar-track">
                  <span
                    className="stats-bar-fill"
                    style={
                      {
                        "--bar-width": `${(month.volume / maxMonthlyVolume) * 100}%`,
                      } as CSSProperties
                    }
                  />
                </span>
                <span className="stats-bar-value">
                  {formatNumber(month.volume)}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel stack">
          <div className="section-heading">
            <h2>{t("aliases")}</h2>
            <span>{exercise.aliases.length}</span>
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
        </section>
      </div>

      <section className="panel stack">
        <div className="section-heading">
          <h2>{t("recentWorkouts")}</h2>
          <span>{workouts.length}</span>
        </div>
        {workouts.length === 0 ? (
          <div className="empty-state">
            <strong>{t("noExerciseHistory")}</strong>
            <p className="muted">{t("exerciseHistoryIntro")}</p>
          </div>
        ) : (
          <div className="agenda-list">
            {workouts.map((workout) => {
              const reps = workout.sets.reduce(
                (total, set) => total + set.reps,
                0,
              );
              const volume = workout.sets.reduce(
                (total, set) => total + set.weight * set.reps,
                0,
              );

              return (
                <Link
                  className="agenda-item"
                  href={`/workouts/${workout.id}`}
                  key={workout.id}
                >
                  <time dateTime={workout.date.toISOString()}>
                    {workout.date.toLocaleDateString("en", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </time>
                  <span>{workout.title || t("workout")}</span>
                  <small>
                    {workout.sets.length}{" "}
                    {workout.sets.length === 1 ? t("set") : t("sets")} ·{" "}
                    {formatInteger(reps)} {t("reps")} · {formatNumber(volume)}{" "}
                    {t("volume")}
                  </small>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}

type SetEntry = {
  reps: number;
  weight: number;
  workout: {
    date: Date;
  };
};

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="item stats-card">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function buildMonthlyTrend(sets: SetEntry[]) {
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setMonth(date.getMonth() - (5 - index));
    date.setDate(1);

    return {
      key: formatMonthKey(date),
      label: date.toLocaleDateString("en", { month: "short" }),
      volume: 0,
    };
  });
  const monthByKey = new Map(months.map((month) => [month.key, month]));

  for (const set of sets) {
    const month = monthByKey.get(formatMonthKey(set.workout.date));

    if (month) {
      month.volume += set.weight * set.reps;
    }
  }

  return months;
}

function maxBy<T>(items: T[], value: (item: T) => number) {
  return items.reduce<T | undefined>((best, item) => {
    if (!best || value(item) > value(best)) {
      return item;
    }

    return best;
  }, undefined);
}

function formatMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
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
