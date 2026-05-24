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
  const periodRows: PeriodRowData[] = [
    { label: t("workouts"), metric: "workouts", formatter: formatInteger },
    { label: t("setsMetric"), metric: "sets", formatter: formatInteger },
    { label: t("reps"), metric: "reps", formatter: formatInteger },
    { label: t("volume"), metric: "volume", formatter: formatNumber },
  ];

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
          <SectionHeader
            title={t("recentActivity")}
            description={t("recentActivityIntro")}
          />
          <div className="stats-mobile-list">
            {periodRows.map((row) => (
              <PeriodCard
                current={stats.currentPeriod}
                currentLabel={t("current")}
                key={row.metric}
                previous={stats.previousPeriod}
                previousLabel={t("previousPeriod")}
                row={row}
              />
            ))}
          </div>
          <div className="table-scroll stats-desktop-table">
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
                {periodRows.map((row) => (
                  <PeriodRow
                    current={stats.currentPeriod}
                    key={row.metric}
                    previous={stats.previousPeriod}
                    row={row}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel stack">
          <SectionHeader
            title={t("monthlyTrend")}
            description={t("monthlyTrendIntro")}
          />
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
        <SectionHeader
          title={t("topExercises")}
          description={t("topExercisesIntro")}
        />
        <div className="stats-mobile-list">
          {stats.exerciseLeaders.map((exercise) => (
            <article className="stats-list-card" key={exercise.exerciseId}>
              <div className="stats-list-card-header">
                <strong>{exercise.exerciseName}</strong>
                <span>{formatNumber(exercise.volume)}</span>
              </div>
              <div className="stats-pairs three">
                <MetricPair
                  label={t("volume")}
                  value={formatNumber(exercise.volume)}
                />
                <MetricPair
                  label={t("setsMetric")}
                  value={formatInteger(exercise.sets)}
                />
                <MetricPair
                  label={t("reps")}
                  value={formatInteger(exercise.reps)}
                />
              </div>
            </article>
          ))}
        </div>
        <div className="table-scroll stats-desktop-table">
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
        <SectionHeader
          title={t("personalRecords")}
          description={t("personalRecordsIntro")}
        />
        <div className="stats-mobile-list">
          {stats.personalRecords.map((record) => (
            <article className="stats-list-card" key={record.exerciseId}>
              <div className="stats-list-card-header">
                <strong>{record.exerciseName}</strong>
              </div>
              <div className="stats-pairs two">
                <MetricPair
                  label={t("maxWeight")}
                  value={formatNumber(record.maxWeight.value)}
                  detail={formatSetDetail(record.maxWeight)}
                />
                <MetricPair
                  label={t("maxReps")}
                  value={formatInteger(record.maxReps.value)}
                  detail={formatSetDetail(record.maxReps)}
                />
                <MetricPair
                  label={t("bestVolumeSet")}
                  value={formatNumber(record.maxVolume.value)}
                  detail={formatSetDetail(record.maxVolume)}
                />
                <MetricPair
                  label={t("estimatedOneRepMax")}
                  value={formatNumber(record.estimatedOneRepMax.value)}
                  detail={formatSetDetail(record.estimatedOneRepMax)}
                />
              </div>
            </article>
          ))}
        </div>
        <div className="table-scroll stats-desktop-table">
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
                  <td>
                    <RecordValue record={record.maxWeight} />
                  </td>
                  <td>
                    <RecordValue record={record.maxReps} />
                  </td>
                  <td>
                    <RecordValue record={record.maxVolume} />
                  </td>
                  <td>
                    <RecordValue record={record.estimatedOneRepMax} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

type PeriodRowData = {
  label: string;
  metric: keyof PeriodStats;
  formatter: (value: number) => string;
};

function SectionHeader({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div className="stats-section-header">
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
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
  previous,
  row,
}: {
  current: PeriodStats;
  previous: PeriodStats;
  row: PeriodRowData;
}) {
  return (
    <tr>
      <td>{row.label}</td>
      <td>{row.formatter(current[row.metric])}</td>
      <td>{row.formatter(previous[row.metric])}</td>
      <td>
        {formatChange(current[row.metric], previous[row.metric], row.formatter)}
      </td>
    </tr>
  );
}

function PeriodCard({
  current,
  currentLabel,
  previous,
  previousLabel,
  row,
}: {
  current: PeriodStats;
  currentLabel: string;
  previous: PeriodStats;
  previousLabel: string;
  row: PeriodRowData;
}) {
  return (
    <article className="stats-list-card">
      <div className="stats-list-card-header">
        <strong>{row.label}</strong>
        <span>
          {formatChange(
            current[row.metric],
            previous[row.metric],
            row.formatter,
          )}
        </span>
      </div>
      <div className="stats-pairs two">
        <MetricPair
          label={currentLabel}
          value={row.formatter(current[row.metric])}
        />
        <MetricPair
          label={previousLabel}
          value={row.formatter(previous[row.metric])}
        />
      </div>
    </article>
  );
}

function MetricPair({
  detail,
  label,
  value,
}: {
  detail?: string;
  label: string;
  value: string;
}) {
  return (
    <span className="stats-pair">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </span>
  );
}

function RecordValue({ record }: { record: SetRecord }) {
  return (
    <span className="stats-record-value">
      <strong>{formatNumber(record.value)}</strong>
      <small>{formatSetDetail(record)}</small>
    </span>
  );
}

function formatSetDetail(record: SetRecord) {
  return `${formatNumber(record.weight)} x ${formatInteger(record.reps)}`;
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
