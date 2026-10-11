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
      date: { gte: new Date(year, month - 1, 1), lt: new Date(year, month, 1) },
    },
    select: { date: true },
  });
  const dates = new Set(workouts.map((w) => formatDateKey(w.date)));
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
              href={`${href(year, month)}&day=${day.dateKey}`}
              aria-label={day.dateKey}
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
          {workouts.length} {t("monthWorkouts")}
        </Text>
      </section>
    </Card>
  );
}
