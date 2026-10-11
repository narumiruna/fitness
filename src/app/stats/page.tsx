import { Card, Grid, Heading, Table, Text } from "@radix-ui/themes";
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
          <Heading as="h1" size="8">
            {t("stats")}
          </Heading>
          <Text as="p" size="2" color="gray">
            {t("statsIntro")}
          </Text>
        </div>
      </div>

      {!hasStats ? (
        <Card>
          <Text as="p" size="2" color="gray">
            {t("noStats")}
          </Text>
        </Card>
      ) : null}

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

      <Card asChild>
        <section>
          <SectionHeader
            title={t("topExercises")}
            description={t("topExercisesIntro")}
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
                  <Table.ColumnHeaderCell>{t("sets")}</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>{t("reps")}</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>{t("volume")}</Table.ColumnHeaderCell>
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

      <Card asChild>
        <section>
          <SectionHeader
            title={t("personalRecords")}
            description={t("personalRecordsIntro")}
          />
          <div className="stats-mobile-list">
            {stats.personalRecords.map((record) => (
              <Card asChild key={record.exerciseId}>
                <article className="stack">
                  <div className="stats-list-card-header">
                    <Text weight="bold">{record.exerciseName}</Text>
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
                {stats.personalRecords.map((record) => (
                  <Table.Row key={record.exerciseId}>
                    <Table.Cell>{record.exerciseName}</Table.Cell>
                    <Table.Cell>
                      <RecordValue record={record.maxWeight} />
                    </Table.Cell>
                    <Table.Cell>
                      <RecordValue record={record.maxReps} />
                    </Table.Cell>
                    <Table.Cell>
                      <RecordValue record={record.maxVolume} />
                    </Table.Cell>
                    <Table.Cell>
                      <RecordValue record={record.estimatedOneRepMax} />
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </div>
        </section>
      </Card>
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
  return (
    <Card asChild>
      <article className="stats-card">
        <Text size="2" color="gray">
          {label}
        </Text>
        <Text size="7" weight="bold">
          {value}
        </Text>
      </article>
    </Card>
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
    <Table.Row>
      <Table.Cell>{row.label}</Table.Cell>
      <Table.Cell>{row.formatter(current[row.metric])}</Table.Cell>
      <Table.Cell>{row.formatter(previous[row.metric])}</Table.Cell>
      <Table.Cell>
        {formatChange(current[row.metric], previous[row.metric], row.formatter)}
      </Table.Cell>
    </Table.Row>
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
    <Card asChild>
      <article className="stack">
        <div className="stats-list-card-header">
          <Text weight="bold">{row.label}</Text>
          <Text>
            {formatChange(
              current[row.metric],
              previous[row.metric],
              row.formatter,
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

function RecordValue({ record }: { record: SetRecord }) {
  return (
    <span className="stats-record-value">
      <Text weight="bold">{formatNumber(record.value)}</Text>
      <Text size="1" color="gray">
        {formatSetDetail(record)}
      </Text>
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
