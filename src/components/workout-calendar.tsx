import { ChevronLeftIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import { Button, Card, Heading, Text } from "@radix-ui/themes";
import NextLink from "next/link";
import {
  buildCalendarMonth,
  formatDateKey,
  formatMonthTitle,
} from "@/lib/calendar";
import { getDictionary, getLocale } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";

export async function WorkoutCalendar({ userId }: { userId: string }) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const calendar = buildCalendarMonth(year, month, today);
  const t = await getDictionary();
  const locale = await getLocale();
  const workouts = await prisma.workout.findMany({
    where: {
      userId,
      state: "COMPLETED",
      date: { gte: calendar.startDate, lt: calendar.endDate },
    },
    select: { date: true },
  });
  const dates = new Set(workouts.map((w) => formatDateKey(w.date)));
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);
  const monthWorkoutCount = workouts.filter(
    (w) => w.date >= monthStart && w.date < monthEnd,
  ).length;
  const href = (y: number, m: number) => `/calendar?year=${y}&month=${m}`;
  return (
    <Card asChild>
      <section className="mini-calendar stack" aria-label={t("calendar")}>
        <div className="section-heading">
          <Button highContrast asChild variant="ghost" size="1">
            <NextLink
              href={href(calendar.previous.year, calendar.previous.month)}
              aria-label={`${t("previous")} · ${t("calendar")}`}
            >
              <ChevronLeftIcon />
            </NextLink>
          </Button>
          <Heading as="h2" size="3">
            {formatMonthTitle(year, month, locale)}
          </Heading>
          <Button highContrast asChild variant="ghost" size="1">
            <NextLink
              href={href(calendar.next.year, calendar.next.month)}
              aria-label={`${t("next")} · ${t("calendar")}`}
            >
              <ChevronRightIcon />
            </NextLink>
          </Button>
        </div>
        <span id="mini-calendar-workout-description" className="sr-only">
          {t("calendarWorkoutDescription")}
        </span>
        <div className="mini-calendar-grid">
          {(
            [
              "weekdaySun",
              "weekdayMon",
              "weekdayTue",
              "weekdayWed",
              "weekdayThu",
              "weekdayFri",
              "weekdaySat",
            ] as const
          ).map((day) => (
            <span className="mini-weekday" key={day}>
              {t(day)}
            </span>
          ))}
          {calendar.cells.map((day) => (
            <NextLink
              key={day.dateKey}
              href={`${href(day.date.getFullYear(), day.date.getMonth() + 1)}&day=${day.dateKey}#selected-date`}
              aria-label={day.dateKey}
              aria-describedby={
                dates.has(day.dateKey)
                  ? "mini-calendar-workout-description"
                  : undefined
              }
              aria-current={day.isToday ? "date" : undefined}
              className={[
                "mini-day",
                day.isToday ? "today" : "",
                !day.isCurrentMonth ? "outside" : "",
                dates.has(day.dateKey) ? "has-workout" : "",
              ].join(" ")}
            >
              {day.date.getDate()}
            </NextLink>
          ))}
        </div>
        <Text size="2" color="teal">
          {t(
            monthWorkoutCount === 1
              ? "workoutsThisMonthOne"
              : "workoutsThisMonthOther",
          ).replace(
            "{count}",
            new Intl.NumberFormat(locale).format(monthWorkoutCount),
          )}
        </Text>
      </section>
    </Card>
  );
}
