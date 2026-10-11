import { PlusIcon } from "@radix-ui/react-icons";
import { Badge, Button, Card, Heading, Link, Text } from "@radix-ui/themes";
import NextLink from "next/link";
import { EmptyState, PageHeader } from "@/components/dashboard";
import { ScheduledOccurrences } from "@/components/scheduled-occurrences";
import { requireUser } from "@/lib/auth";
import {
  buildCalendarMonth,
  formatDateKey,
  formatMonthTitle,
  parseDateKey,
  resolveCalendarMonth,
} from "@/lib/calendar";
import { getDictionary, getLocale } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { sumVolume } from "@/lib/stats-calculations";

type CalendarPageProps = {
  searchParams: Promise<{
    year?: string | string[];
    month?: string | string[];
    day?: string | string[];
  }>;
};

export default async function CalendarPage({
  searchParams,
}: CalendarPageProps) {
  const user = await requireUser();
  const t = await getDictionary();
  const locale = await getLocale();
  const params = await searchParams;
  const today = new Date();
  const { year, month } = resolveCalendarMonth(params, today);
  const calendar = buildCalendarMonth(year, month, today);
  const requested = Array.isArray(params.day) ? params.day[0] : params.day;
  const candidate = parseDateKey(requested);
  const selected =
    candidate && candidate >= calendar.startDate && candidate < calendar.endDate
      ? candidate
      : year === today.getFullYear() && month === today.getMonth() + 1
        ? new Date(today.getFullYear(), today.getMonth(), today.getDate())
        : new Date(year, month - 1, 1);
  const selectedKey = formatDateKey(selected);
  const workouts = await prisma.workout.findMany({
    where: {
      userId: user.id,
      date: { gte: calendar.startDate, lt: calendar.endDate },
    },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    include: {
      sets: {
        where: { completed: true, workout: { state: "COMPLETED" } },
        include: { exercise: true },
        orderBy: { order: "asc" },
      },
    },
  });
  const workoutsByDate = new Map<string, typeof workouts>();
  for (const workout of workouts) {
    const key = formatDateKey(workout.date);
    workoutsByDate.set(key, [...(workoutsByDate.get(key) ?? []), workout]);
  }
  const dayWorkouts = workoutsByDate.get(selectedKey) ?? [];
  const monthWorkouts = workouts.filter(
    (w) =>
      w.state === "COMPLETED" &&
      w.date >= new Date(year, month - 1, 1) &&
      w.date < new Date(year, month, 1),
  );
  const createHref = `/workouts?date=${selectedKey}#new-workout`;
  return (
    <section className="calendar-shell">
      <ScheduledOccurrences
        userId={user.id}
        start={calendar.startDate}
        end={calendar.endDate}
      />
      <PageHeader title={t("calendar")} description={t("calendarIntro")}>
        <Button highContrast asChild>
          <NextLink href={createHref}>
            <PlusIcon aria-hidden="true" />
            {t("newWorkoutAction")}
          </NextLink>
        </Button>
      </PageHeader>
      <div className="dashboard-columns calendar-layout">
        <div className="calendar-main">
          <Card asChild>
            <section className="calendar-month stack">
              <div className="section-heading">
                <Heading as="h2" size="5">
                  {formatMonthTitle(year, month, locale)}
                </Heading>
                <div className="calendar-actions">
                  <Button highContrast asChild variant="soft">
                    <NextLink href={calendarHref(calendar.previous)}>
                      {t("previous")}
                    </NextLink>
                  </Button>
                  <Button highContrast asChild variant="soft">
                    <NextLink href="/calendar">{t("today")}</NextLink>
                  </Button>
                  <Button highContrast asChild variant="soft">
                    <NextLink href={calendarHref(calendar.next)}>
                      {t("next")}
                    </NextLink>
                  </Button>
                </div>
              </div>
              <div className="calendar-grid">
                {[
                  t("weekdaySun"),
                  t("weekdayMon"),
                  t("weekdayTue"),
                  t("weekdayWed"),
                  t("weekdayThu"),
                  t("weekdayFri"),
                  t("weekdaySat"),
                ].map((weekday) => (
                  <div className="calendar-weekday" key={weekday}>
                    {weekday}
                  </div>
                ))}
                {calendar.cells.map((day) => {
                  const entries = workoutsByDate.get(day.dateKey) ?? [];
                  return (
                    <div
                      key={day.dateKey}
                      className={[
                        "calendar-day",
                        day.isCurrentMonth ? "" : "outside-month",
                        day.isToday ? "today" : "",
                        day.dateKey === selectedKey ? "selected" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <NextLink
                        className="calendar-day-number"
                        aria-label={day.dateKey}
                        aria-current={
                          day.dateKey === selectedKey ? "date" : undefined
                        }
                        href={`${calendarHref({ year, month })}&day=${day.dateKey}#selected-date`}
                      >
                        {day.day}
                      </NextLink>
                      <div className="calendar-workouts">
                        {entries.slice(0, 2).map((workout) => (
                          <Link highContrast asChild key={workout.id}>
                            <NextLink
                              className="calendar-workout"
                              aria-label={`${workout.title || t("workout")} · ${day.dateKey}`}
                              href={`/workouts/${workout.id}`}
                            >
                              <span className="calendar-workout-title">
                                {workout.title || t("workout")}
                              </span>
                              <span className="calendar-workout-meta">
                                {workout.sets.length} {t("sets")}
                              </span>
                            </NextLink>
                          </Link>
                        ))}
                        {entries.length > 2 ? (
                          <NextLink
                            className="calendar-more"
                            href={`${calendarHref({ year, month })}&day=${day.dateKey}#selected-date`}
                          >
                            +{entries.length - 2} {t("more")}
                          </NextLink>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </Card>
          <Card asChild>
            <section className="calendar-agenda stack">
              <div className="section-heading">
                <Heading as="h2" size="4">
                  {t("monthWorkouts")}
                </Heading>
                <Badge color="gray">{monthWorkouts.length}</Badge>
              </div>
              {monthWorkouts.length ? (
                <div className="agenda-list">
                  {monthWorkouts.map((workout) => (
                    <Link highContrast asChild key={workout.id}>
                      <NextLink
                        className="agenda-item"
                        href={`/workouts/${workout.id}`}
                      >
                        <time dateTime={formatDateKey(workout.date)}>
                          {workout.date.toLocaleDateString(locale, {
                            month: "short",
                            day: "numeric",
                          })}
                        </time>
                        <span>{workout.title || t("workout")}</span>
                        <Text size="1" color="gray">
                          {workout.sets.length} {t("sets")}
                        </Text>
                      </NextLink>
                    </Link>
                  ))}
                </div>
              ) : (
                <Text as="p" size="2" color="gray">
                  {t("noMonthWorkouts")}
                </Text>
              )}
            </section>
          </Card>
        </div>
        <Card asChild>
          <aside id="selected-date" className="selected-date-panel stack">
            <Text as="p" size="1" color="gray">
              {t("selectedDate")}
            </Text>
            <Heading as="h2" size="4">
              {selected.toLocaleDateString(locale, {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </Heading>
            {dayWorkouts.length ? (
              dayWorkouts.map((workout) => (
                <article className="selected-workout stack" key={workout.id}>
                  <Heading as="h3" size="3">
                    {workout.title || t("workout")}
                  </Heading>
                  <Text as="p" size="2" color="gray">
                    {[
                      ...new Set(
                        workout.sets.map((s) => s.exercise.defaultName),
                      ),
                    ].join(" · ") || t("noSets")}
                  </Text>
                  <div className="meta-row">
                    <Badge color="gray">
                      {workout.sets.length} {t("sets")}
                    </Badge>
                    <Badge color="gray">
                      {new Intl.NumberFormat(locale).format(
                        sumVolume(workout.sets),
                      )}{" "}
                      {t("volume")}
                    </Badge>
                  </div>
                  {workout.notes ? (
                    <Text as="p" size="2">
                      {workout.notes}
                    </Text>
                  ) : null}
                  <Button highContrast asChild variant="soft">
                    <NextLink href={`/workouts/${workout.id}`}>
                      {t("viewDetails")}
                    </NextLink>
                  </Button>
                </article>
              ))
            ) : (
              <EmptyState title={t("noDayWorkouts")} />
            )}
            <Button highContrast asChild variant="outline">
              <NextLink href={createHref}>
                <PlusIcon aria-hidden="true" />
                {t("createWorkout")}
              </NextLink>
            </Button>
            <Text as="p" size="1" color="gray">
              {t("volumeDefinition")}
            </Text>
          </aside>
        </Card>
      </div>
    </section>
  );
}
function calendarHref({ year, month }: { year: number; month: number }) {
  return `/calendar?year=${year}&month=${month}`;
}
