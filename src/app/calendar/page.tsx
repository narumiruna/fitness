import Link from "next/link";
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
          <h1>{t("calendar")}</h1>
          <p>{monthTitle}</p>
        </div>
        <div className="calendar-actions">
          <Link
            className="button secondary"
            href={calendarHref(calendar.previous)}
          >
            {t("previous")}
          </Link>
          <Link className="button secondary" href="/calendar">
            {t("today")}
          </Link>
          <Link className="button secondary" href={calendarHref(calendar.next)}>
            {t("next")}
          </Link>
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
                    <Link
                      className="calendar-workout"
                      href={`/workouts/${workout.id}`}
                      key={workout.id}
                    >
                      <span className="calendar-workout-title">
                        {workout.title || t("workout")}
                      </span>
                      <span className="calendar-workout-meta">
                        {workout._count.sets}{" "}
                        {workout._count.sets === 1 ? t("set") : t("sets")}
                        {workout.notes ? ` · ${t("notesAvailable")}` : ""}
                      </span>
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
    </section>
  );
}

function calendarHref({ year, month }: { year: number; month: number }) {
  return `/calendar?year=${year}&month=${month}`;
}
