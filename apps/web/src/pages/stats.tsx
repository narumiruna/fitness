import type {
  PeriodStats,
  SetRecord,
} from "@narumitw/fitness-core/stats-calculations";
import {
  type ExercisePersonalRecords,
  resolveStatsRange,
} from "@narumitw/fitness-core/stats-calculations";
import { Button, Card, Grid, Heading, Table, Text } from "@radix-ui/themes";
import type { CSSProperties } from "react";
import { Link as RouterLink } from "react-router-dom";
import { usePageView, useSearch } from "@/api/views";
import { ActionForm } from "@/components/action-form";
import { ConsistencyReport } from "@/components/consistency-report";
import { MetricCard, PageHeader } from "@/components/dashboard";
import { FormSelect } from "@/components/form-select";
import { MuscleReport } from "@/components/muscle-report";
import { TrainingChart } from "@/components/training-chart";
import type { MessageKey } from "@/lib/i18n";
import { useDictionary, useLocale } from "@/lib/i18n";

export default function StatsPage() {
  const { stats } = usePageView("stats");
  const t = useDictionary();
  const locale = useLocale();
  const formatInteger = (value: number) => formatNumeric(value, locale, 0);
  const formatNumber = (value: number) => formatNumeric(value, locale, 1);
  const params = useSearch();
  const range = resolveStatsRange(params.range);
  const rangeLabel = t(
    range === "30"
      ? "last30Days"
      : range === "90"
        ? "last90Days"
        : range === "180"
          ? "last180Days"
          : "allTime",
  );
  const records =
    params.records === "range" ? stats.personalRecords : stats.allTimeRecords;
  const distribution = stats.distribution.map((item) => ({
    ...item,
    label: item.key === "other" ? t("otherExercises") : item.label,
  }));
  const colors = [
    "#0f766e",
    "#298c7f",
    "#419e90",
    "#68aa9e",
    "#8fbdb4",
    "#b4d1ca",
    "#d6e4de",
  ];
  let offset = 0;
  const stops = distribution.map((item, index) => {
    const start = offset;
    offset += stats.overview.totalSets
      ? (item.value / stats.overview.totalSets) * 100
      : 0;
    return `${colors[index]} ${start}% ${offset}%`;
  });
  const hasStats = stats.overview.totalSets > 0;
  const hasWorkouts = stats.overview.totalWorkouts > 0;
  const weeklyLabel = t(
    stats.weeklyBucketWeeks === 1 ? "workoutsPerWeek" : "workoutsPerPeriod",
  );
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
    <section className="stack stats-page">
      <PageHeader title={t("stats")} description={t("statsIntro")}>
        <ActionForm className="range-filter" action="/stats" key={range}>
          <FormSelect
            name="range"
            label={t("dateRange")}
            defaultValue={range}
            options={[
              { value: "all", label: t("allTime") },
              { value: "30", label: t("last30Days") },
              { value: "90", label: t("last90Days") },
              { value: "180", label: t("last180Days") },
            ]}
          />
          <input
            type="hidden"
            name="records"
            value={params.records === "range" ? "range" : "all"}
          />
          <Button highContrast variant="soft" type="submit">
            {t("applyFilters")}
          </Button>
        </ActionForm>
      </PageHeader>
      <Text as="p" size="2" color="gray">
        {rangeLabel} · {t("volumeDefinition")}
      </Text>

      {!hasStats ? (
        <Card className="stack">
          <Text as="p" size="2" color="gray">
            {t(hasWorkouts ? "noSetStats" : "noStats")}
          </Text>
          <div>
            <Button highContrast variant="soft" asChild>
              <RouterLink to={hasWorkouts ? "/workouts" : "/workouts/new"}>
                {t(hasWorkouts ? "workouts" : "newWorkoutAction")}
              </RouterLink>
            </Button>
          </div>
        </Card>
      ) : null}

      {stats.overview.totalWorkouts > 0 ? (
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
      ) : null}

      {hasWorkouts ? (
        <div className="charts-grid">
          {hasStats ? (
            <Card asChild>
              <section>
                <SectionHeader
                  title={t("volumeHistory")}
                  description={rangeLabel}
                />
                <TrainingChart
                  locale={locale}
                  points={stats.daily}
                  label={t("volumeHistory")}
                  kind="line"
                  dataLabel={t("chartData")}
                />
              </section>
            </Card>
          ) : null}
          <Card asChild>
            <section>
              <SectionHeader
                title={weeklyLabel}
                description={
                  stats.weeklyBucketWeeks === 1
                    ? t("recordedWorkouts")
                    : t("recordedWorkoutPeriods").replace(
                        "{weeks}",
                        String(stats.weeklyBucketWeeks),
                      )
                }
              />
              <TrainingChart
                locale={locale}
                points={stats.weekly}
                label={weeklyLabel}
                kind="bar"
                dataLabel={t("chartData")}
              />
            </section>
          </Card>
        </div>
      ) : null}
      {hasStats ? (
        <div className="charts-grid three">
          <Card asChild>
            <section>
              <SectionHeader
                title={t("exerciseDistribution")}
                description={t("bySets")}
              />
              <div className="distribution">
                <div
                  className="donut"
                  role="img"
                  aria-label={`${t("totalSets")}: ${stats.overview.totalSets}`}
                  style={{ background: `conic-gradient(${stops.join(",")})` }}
                >
                  <div>
                    <strong>{stats.overview.totalSets}</strong>
                    <span>{t("totalSets")}</span>
                  </div>
                </div>
                <ul className="chart-legend">
                  {distribution.map((item, index) => (
                    <li key={item.key}>
                      <span
                        className="legend-dot"
                        style={{ background: colors[index] }}
                      />
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                      <span>
                        {(
                          (item.value / stats.overview.totalSets) *
                          100
                        ).toFixed(1)}
                        %
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </Card>
          <Card asChild>
            <section>
              <SectionHeader
                title={t("exerciseVolume")}
                description={rangeLabel}
              />
              <div className="stats-bars">
                {stats.exerciseLeaders.map((item) => (
                  <div key={item.exerciseId} className="stats-bar-row">
                    <span>{item.exerciseName}</span>
                    <span className="stats-bar-track">
                      <span
                        className="stats-bar-fill"
                        style={
                          {
                            "--bar-width": `${(item.volume / Math.max(...stats.exerciseLeaders.map((e) => e.volume), 1)) * 100}%`,
                          } as CSSProperties
                        }
                      />
                    </span>
                    <span className="stats-bar-value">
                      {formatNumber(item.volume)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </Card>
          <RecordSummary
            locale={locale}
            records={records}
            range={range}
            scope={params.records}
            t={t}
          />
        </div>
      ) : stats.allTimeRecords.length ? (
        <RecordSummary
          locale={locale}
          records={records}
          range={range}
          scope={params.records}
          t={t}
        />
      ) : null}
      {stats.monthlyTrend.some((month) => month.workouts > 0) ? (
        <details className="analytics-details">
          <summary>
            {t("recentActivity")} · {t("monthlyTrend")}
          </summary>
          <Grid columns={{ initial: "1", md: "2" }} gap="4">
            <Card asChild>
              <section>
                <SectionHeader
                  title={t("recentActivity")}
                  description={t("recentActivityIntro")}
                />
                <div className="stats-mobile-list">
                  {periodRows.map((row) => (
                    <PeriodCard
                      locale={locale}
                      newLabel={t("newActivity")}
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
                  <Table.Root variant="surface">
                    <Table.Header>
                      <Table.Row>
                        <Table.ColumnHeaderCell>
                          {t("metric")}
                        </Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell>
                          {t("current30Days")}
                        </Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell>
                          {t("previous30Days")}
                        </Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell>
                          {t("change")}
                        </Table.ColumnHeaderCell>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {periodRows.map((row) => (
                        <PeriodRow
                          locale={locale}
                          newLabel={t("newActivity")}
                          current={stats.currentPeriod}
                          key={row.metric}
                          previous={stats.previousPeriod}
                          row={row}
                        />
                      ))}
                    </Table.Body>
                  </Table.Root>
                </div>
              </section>
            </Card>

            <Card asChild>
              <section className="stack">
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
            </Card>
          </Grid>
        </details>
      ) : null}

      {hasStats ? (
        <details className="analytics-details">
          <summary>
            {t("topExercises")} · {t("details")}
          </summary>
          <Card asChild>
            <section>
              <SectionHeader
                title={t("topExercises")}
                description={`${rangeLabel} · ${t("topExercisesIntro")}`}
              />
              <div className="stats-mobile-list">
                {stats.exerciseLeaders.map((exercise) => (
                  <Card asChild key={exercise.exerciseId}>
                    <article className="stack">
                      <div className="stats-list-card-header">
                        <Text weight="bold">{exercise.exerciseName}</Text>
                        <Text>{formatNumber(exercise.volume)}</Text>
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
                  </Card>
                ))}
              </div>
              <div className="table-scroll stats-desktop-table">
                <Table.Root variant="surface">
                  <Table.Header>
                    <Table.Row>
                      <Table.ColumnHeaderCell>
                        {t("exercise")}
                      </Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>
                        {t("sets")}
                      </Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>
                        {t("reps")}
                      </Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>
                        {t("volume")}
                      </Table.ColumnHeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {stats.exerciseLeaders.map((exercise) => (
                      <Table.Row key={exercise.exerciseId}>
                        <Table.Cell>{exercise.exerciseName}</Table.Cell>
                        <Table.Cell>{formatInteger(exercise.sets)}</Table.Cell>
                        <Table.Cell>{formatInteger(exercise.reps)}</Table.Cell>
                        <Table.Cell>{formatNumber(exercise.volume)}</Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Root>
              </div>
            </section>
          </Card>
        </details>
      ) : null}
      {stats.allTimeRecords.length ? (
        <details className="analytics-details">
          <summary>
            {t("personalRecords")} · {t("details")}
          </summary>
          <Card asChild>
            <section>
              <SectionHeader
                title={t("personalRecords")}
                description={t(
                  params.records === "range"
                    ? "rangeRecords"
                    : "allTimeRecords",
                )}
              />

              <div className="stats-mobile-list">
                {records.map((record) => (
                  <Card asChild key={record.exerciseId}>
                    <article className="stack">
                      <div className="stats-list-card-header">
                        <Text weight="bold">{record.exerciseName}</Text>
                      </div>
                      <div className="stats-pairs two">
                        <MetricPair
                          label={t("maxWeight")}
                          value={formatNumber(record.maxWeight.value)}
                          detail={formatSetDetail(record.maxWeight, locale)}
                        />
                        <MetricPair
                          label={t("maxReps")}
                          value={formatInteger(record.maxReps.value)}
                          detail={formatSetDetail(record.maxReps, locale)}
                        />
                        <MetricPair
                          label={t("bestVolumeSet")}
                          value={formatNumber(record.maxVolume.value)}
                          detail={formatSetDetail(record.maxVolume, locale)}
                        />
                        <MetricPair
                          label={t("estimatedOneRepMax")}
                          value={formatNumber(record.estimatedOneRepMax.value)}
                          detail={formatSetDetail(
                            record.estimatedOneRepMax,
                            locale,
                          )}
                        />
                      </div>
                    </article>
                  </Card>
                ))}
              </div>
              <div className="table-scroll stats-desktop-table">
                <Table.Root variant="surface">
                  <Table.Header>
                    <Table.Row>
                      <Table.ColumnHeaderCell>
                        {t("exercise")}
                      </Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>
                        {t("maxWeight")}
                      </Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>
                        {t("maxReps")}
                      </Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>
                        {t("bestVolumeSet")}
                      </Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>
                        {t("estimatedOneRepMax")}
                      </Table.ColumnHeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {records.map((record) => (
                      <Table.Row key={record.exerciseId}>
                        <Table.Cell>{record.exerciseName}</Table.Cell>
                        <Table.Cell>
                          <RecordValue
                            locale={locale}
                            record={record.maxWeight}
                          />
                        </Table.Cell>
                        <Table.Cell>
                          <RecordValue
                            locale={locale}
                            record={record.maxReps}
                          />
                        </Table.Cell>
                        <Table.Cell>
                          <RecordValue
                            locale={locale}
                            record={record.maxVolume}
                          />
                        </Table.Cell>
                        <Table.Cell>
                          <RecordValue
                            locale={locale}
                            record={record.estimatedOneRepMax}
                          />
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Root>
              </div>
            </section>
          </Card>
        </details>
      ) : null}
      <details className="dashboard-tools" open={params.year !== undefined}>
        <summary>
          {t("consistency")} · {t("muscle")}
        </summary>
        <div className="stack">
          <ConsistencyReport year={params.year} />
          <MuscleReport />
          <Text size="2" color="gray">
            {t("workingVolume")}: {stats.workingVolume}
          </Text>
        </div>
      </details>
    </section>
  );
}

function RecordSummary({
  locale,
  records,
  range,
  scope,
  t,
}: {
  locale: string;
  records: ExercisePersonalRecords[];
  range: string;
  scope?: string;
  t: (key: MessageKey) => string;
}) {
  const formatNumber = (value: number) => formatNumeric(value, locale, 1);
  return (
    <Card asChild>
      <section className="stack">
        <SectionHeader
          title={t("personalRecords")}
          description={t(scope === "range" ? "rangeRecords" : "allTimeRecords")}
        />
        <ActionForm
          className="range-filter records-filter"
          action="/stats"
          key={scope}
        >
          <input type="hidden" name="range" value={range} />
          <FormSelect
            label={t("recordScope")}
            name="records"
            defaultValue={scope === "range" ? "range" : "all"}
            options={[
              { value: "all", label: t("allTimeRecords") },
              { value: "range", label: t("rangeRecords") },
            ]}
          />
          <Button highContrast variant="soft" type="submit">
            {t("applyFilters")}
          </Button>
        </ActionForm>
        {records.length ? (
          <div className="record-summary-list">
            {records.map((record) => (
              <div className="record-summary-row" key={record.exerciseId}>
                <Text size="2" weight="medium">
                  {record.exerciseName}
                </Text>
                <Text size="2">{formatNumber(record.maxWeight.value)}</Text>
                <Text size="1" color="gray">
                  {record.maxWeight.date.toLocaleDateString(locale, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </Text>
              </div>
            ))}
          </div>
        ) : (
          <Text size="2" color="gray">
            {t("noRecords")}
          </Text>
        )}
        <Text size="1" color="gray">
          {t("maxWeight")}. {t("weightUnitNote")}
        </Text>
      </section>
    </Card>
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
      <Heading as="h2" size="5">
        {title}
      </Heading>
      <Text as="p" size="2" color="gray">
        {description}
      </Text>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return <MetricCard label={label} value={value} />;
}

function PeriodRow({
  locale,
  newLabel,
  current,
  previous,
  row,
}: {
  current: PeriodStats;
  previous: PeriodStats;
  row: PeriodRowData;
  locale: string;
  newLabel: string;
}) {
  return (
    <Table.Row>
      <Table.Cell>{row.label}</Table.Cell>
      <Table.Cell>{row.formatter(current[row.metric])}</Table.Cell>
      <Table.Cell>{row.formatter(previous[row.metric])}</Table.Cell>
      <Table.Cell>
        {formatChange(
          current[row.metric],
          previous[row.metric],
          row.formatter,
          locale,
          newLabel,
        )}
      </Table.Cell>
    </Table.Row>
  );
}

function PeriodCard({
  locale,
  newLabel,
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
  locale: string;
  newLabel: string;
}) {
  return (
    <Card asChild>
      <article className="stack">
        <div className="stats-list-card-header">
          <Text weight="bold">{row.label}</Text>
          <Text>
            {formatChange(
              current[row.metric],
              previous[row.metric],
              row.formatter,
              locale,
              newLabel,
            )}
          </Text>
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
    </Card>
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
      <Text size="1" color="gray">
        {label}
      </Text>
      <Text size="3" weight="bold">
        {value}
      </Text>
      {detail ? (
        <Text size="1" color="gray">
          {detail}
        </Text>
      ) : null}
    </span>
  );
}

function RecordValue({
  record,
  locale,
}: {
  record: SetRecord;
  locale: string;
}) {
  return (
    <span className="stats-record-value">
      <Text weight="bold">{formatNumeric(record.value, locale, 1)}</Text>
      <Text size="1" color="gray">
        {formatSetDetail(record, locale)}
      </Text>
    </span>
  );
}

function formatSetDetail(record: SetRecord, locale: string) {
  return `${formatNumeric(record.weight, locale, 1)} × ${formatNumeric(record.reps, locale, 0)} · ${record.date.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" })}`;
}

function formatChange(
  current: number,
  previous: number,
  formatter: (value: number) => string,
  locale: string,
  newLabel: string,
) {
  const difference = current - previous;

  if (previous === 0) {
    return difference === 0 ? "0%" : newLabel;
  }

  const percent = (difference / previous) * 100;
  const sign = difference > 0 ? "+" : "";

  return `${sign}${formatter(difference)} (${sign}${formatNumeric(percent, locale, 1)}%)`;
}

function formatNumeric(
  value: number,
  locale: string,
  maximumFractionDigits: number,
) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);
}
