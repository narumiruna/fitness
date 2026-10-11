import { Badge, Button, Card, Heading, Link, Text } from "@radix-ui/themes";
import NextLink from "next/link";
import { requireUser } from "@/lib/auth";
import {
  buildCalendarMonth,
  formatDateKey,
  formatMonthTitle,
  resolveCalendarMonth,
} from "@/lib/calendar";
import { getDictionary } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";

type CalendarPageProps = {
  searchParams: Promise<{
    year?: string | string[];
    month?: string | string[];
  }>;
};

const visibleWorkoutLimit = 2;

export default async function CalendarPage({
  searchParams,
}: CalendarPageProps) {
  const user = await requireUser();
  const t = await getDictionary();
  const params = await searchParams;
  const today = new Date();
  const { year, month } = resolveCalendarMonth(params, today);
  const calendar = buildCalendarMonth(year, month, today);
  const monthTitle = formatMonthTitle(year, month);
  const workouts = await prisma.workout.findMany({
    where: {
      userId: user.id,
      date: {
        gte: calendar.startDate,
        lt: calendar.endDate,
      },
    },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      date: true,
      title: true,
      notes: true,
      _count: {
        select: { sets: true },
      },
    },
  });
  const workoutsByDate = new Map<string, typeof workouts>();
  const currentMonthStart = new Date(year, month - 1, 1);
  const currentMonthEnd = new Date(year, month, 1);
  const currentMonthWorkouts = workouts.filter(
    (workout) =>
      workout.date >= currentMonthStart && workout.date < currentMonthEnd,
  );

  for (const workout of workouts) {
    const key = formatDateKey(workout.date);
    const existing = workoutsByDate.get(key) ?? [];
    existing.push(workout);
    workoutsByDate.set(key, existing);
  }

  return (
    <section className="calendar-shell">
      <div className="page-header calendar-header">
        <div>
          <Heading as="h1" size="8">
            {t("calendar")}
          </Heading>
          <Text as="p" size="2" color="gray">
            {monthTitle}
          </Text>
        </div>
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
            <NextLink href={calendarHref(calendar.next)}>{t("next")}</NextLink>
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
          const dayWorkouts = workoutsByDate.get(day.dateKey) ?? [];
          const visibleWorkouts = dayWorkouts.slice(0, visibleWorkoutLimit);
          const hiddenWorkoutCount =
            dayWorkouts.length - visibleWorkouts.length;

          return (
            <div
              className={[
                "calendar-day",
                day.isCurrentMonth ? "" : "outside-month",
                day.isToday ? "today" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              key={day.dateKey}
            >
              <span className="calendar-day-number">{day.day}</span>
              {visibleWorkouts.length > 0 ? (
                <div className="calendar-workouts">
                  {visibleWorkouts.map((workout) => (
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
                          {workout._count.sets}{" "}
                          {workout._count.sets === 1 ? t("set") : t("sets")}
                          {workout.notes ? ` · ${t("notesAvailable")}` : ""}
                        </span>
                      </NextLink>
                    </Link>
                  ))}
                  {hiddenWorkoutCount > 0 ? (
                    <span className="calendar-more">
                      +{hiddenWorkoutCount} {t("more")}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <Card asChild>
        <section className="calendar-agenda">
          <div className="section-heading">
            <Heading as="h2" size="5">
              {t("monthWorkouts")}
            </Heading>
            <Badge color="gray">{currentMonthWorkouts.length}</Badge>
          </div>
          {currentMonthWorkouts.length > 0 ? (
            <div className="agenda-list">
              {currentMonthWorkouts.map((workout) => (
                <Link highContrast asChild key={workout.id}>
                  <NextLink
                    className="agenda-item"
                    href={`/workouts/${workout.id}`}
                  >
                    <time dateTime={workout.date.toISOString()}>
                      {workout.date.toLocaleDateString("en", {
                        month: "short",
                        day: "numeric",
                      })}
                    </time>
                    <span>{workout.title || t("workout")}</span>
                    <Text size="1" color="gray">
                      {workout._count.sets}{" "}
                      {workout._count.sets === 1 ? t("set") : t("sets")}
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
    </section>
  );
}

function calendarHref({ year, month }: { year: number; month: number }) {
  return `/calendar?year=${year}&month=${month}`;
}
