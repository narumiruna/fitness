import type { CSSProperties } from "react";
import { requireUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { getUserStats, type PeriodStats, type SetRecord } from "@/lib/stats";

export default async function StatsPage() {
  const user = await requireUser();
  const t = await getDictionary();
  const stats = await getUserStats(user.id);
  const hasStats = stats.overview.totalSets > 0;
  const maxMonthlyVolume = Math.max(
    ...stats.monthlyTrend.map((month) => month.volume),
    1,
  );

  return (
    <section className="stack">
      <div className="page-header">
        <div>
          <h1>{t("stats")}</h1>
          <p>{t("statsIntro")}</p>
        </div>
      </div>

      {!hasStats ? <div className="item muted">{t("noStats")}</div> : null}

      <section className="stats-card-grid" aria-label={t("overview")}>
        <StatCard
          label={t("totalWorkouts")}
          value={formatInteger(stats.overview.totalWorkouts)}
        />
        <StatCard
          label={t("trainingDays")}
          value={formatInteger(stats.overview.trainingDays)}
        />
        <StatCard
          label={t("totalSets")}
          value={formatInteger(stats.overview.totalSets)}
        />
        <StatCard
          label={t("totalReps")}
          value={formatInteger(stats.overview.totalReps)}
        />
        <StatCard
          label={t("totalVolume")}
          value={formatNumber(stats.overview.totalVolume)}
        />
        <StatCard
          label={t("averageVolumePerWorkout")}
          value={formatNumber(stats.overview.averageVolumePerWorkout)}
        />
      </section>

      <div className="grid">
        <section className="panel">
          <h2>{t("recentActivity")}</h2>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("metric")}</th>
                  <th>{t("current30Days")}</th>
                  <th>{t("previous30Days")}</th>
                  <th>{t("change")}</th>
                </tr>
              </thead>
              <tbody>
                <PeriodRow
                  current={stats.currentPeriod}
                  formatter={formatInteger}
                  label={t("workouts")}
                  metric="workouts"
                  previous={stats.previousPeriod}
                />
                <PeriodRow
                  current={stats.currentPeriod}
                  formatter={formatInteger}
                  label={t("setsMetric")}
                  metric="sets"
                  previous={stats.previousPeriod}
                />
                <PeriodRow
                  current={stats.currentPeriod}
                  formatter={formatInteger}
                  label={t("reps")}
                  metric="reps"
                  previous={stats.previousPeriod}
                />
                <PeriodRow
                  current={stats.currentPeriod}
                  formatter={formatNumber}
                  label={t("volume")}
                  metric="volume"
                  previous={stats.previousPeriod}
                />
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel stack">
          <h2>{t("monthlyTrend")}</h2>
          <div className="stats-bars">
            {stats.monthlyTrend.map((month) => (
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
      </div>

      <section className="panel">
        <h2>{t("topExercises")}</h2>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>{t("exercise")}</th>
                <th>{t("sets")}</th>
                <th>{t("reps")}</th>
                <th>{t("volume")}</th>
              </tr>
            </thead>
            <tbody>
              {stats.exerciseLeaders.map((exercise) => (
                <tr key={exercise.exerciseId}>
                  <td>{exercise.exerciseName}</td>
                  <td>{formatInteger(exercise.sets)}</td>
                  <td>{formatInteger(exercise.reps)}</td>
                  <td>{formatNumber(exercise.volume)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>{t("personalRecords")}</h2>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>{t("exercise")}</th>
                <th>{t("maxWeight")}</th>
                <th>{t("maxReps")}</th>
                <th>{t("bestVolumeSet")}</th>
                <th>{t("estimatedOneRepMax")}</th>
              </tr>
            </thead>
            <tbody>
              {stats.personalRecords.map((record) => (
                <tr key={record.exerciseId}>
                  <td>{record.exerciseName}</td>
                  <td>{formatRecord(record.maxWeight)}</td>
                  <td>{formatRecord(record.maxReps)}</td>
                  <td>{formatRecord(record.maxVolume)}</td>
                  <td>{formatRecord(record.estimatedOneRepMax)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="item stats-card">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function PeriodRow({
  current,
  formatter,
  label,
  metric,
  previous,
}: {
  current: PeriodStats;
  formatter: (value: number) => string;
  label: string;
  metric: keyof PeriodStats;
  previous: PeriodStats;
}) {
  return (
    <tr>
      <td>{label}</td>
      <td>{formatter(current[metric])}</td>
      <td>{formatter(previous[metric])}</td>
      <td>{formatChange(current[metric], previous[metric], formatter)}</td>
    </tr>
  );
}

function formatRecord(record: SetRecord) {
  return `${formatNumber(record.value)} (${formatNumber(record.weight)} x ${formatInteger(record.reps)})`;
}

function formatChange(
  current: number,
  previous: number,
  formatter: (value: number) => string,
) {
  const difference = current - previous;

  if (previous === 0) {
    return difference === 0 ? "0%" : "New";
  }

  const percent = (difference / previous) * 100;
  const sign = difference > 0 ? "+" : "";

  return `${sign}${formatter(difference)} (${sign}${formatNumber(percent)}%)`;
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
