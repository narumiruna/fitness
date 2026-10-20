import { formatDateKey } from "@narumitw/fitness-core/calendar";
import { Badge, Card, Heading, Link, Text } from "@radix-ui/themes";
import { Link as RouterLink } from "react-router-dom";
import { usePageView } from "@/api/views";
import { useDictionary } from "@/lib/i18n";
import { StartSessionForm } from "./session-panel";
export function ScheduledOccurrences({
  start,
  end,
}: {
  start: Date;
  end: Date;
}) {
  const t = useDictionary();
  const { schedules, sessions, today } = usePageView("calendar");
  const rows = [];
  for (
    let d = new Date(start);
    d < end;
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
  ) {
    const date = formatDateKey(d);
    const session = sessions.find(
      (w) => w.plannedDate && formatDateKey(w.plannedDate) === date,
    );
    const plan = schedules.find(
      (s) =>
        s.weekday === d.getDay() &&
        s.effectiveFrom <= d &&
        (!s.effectiveTo || s.effectiveTo > d),
    );
    if (!plan && !session) continue;
    const status =
      session?.state === "ABANDONED"
        ? "ABANDONED"
        : session?.state === "COMPLETED" &&
            session.sets.some((set) => set.completed)
          ? "COMPLETED"
          : session && ["ACTIVE", "PAUSED"].includes(session.state)
            ? "inProgress"
            : date < today
              ? "missed"
              : "planned";
    rows.push(
      <Card key={date} className="stack">
        <Text>
          {date}: {session?.templateTitle ?? plan?.title}
        </Text>
        <Badge>{t(status)}</Badge>
        {session ? (
          <Link asChild>
            <RouterLink to={`/workouts/${session.id}`}>{t("view")}</RouterLink>
          </Link>
        ) : plan?.templateId && date >= today ? (
          <StartSessionForm
            sourceId={plan.templateId}
            source="template"
            date={date}
            scheduled
          />
        ) : null}
      </Card>,
    );
  }
  return (
    <Card className="stack">
      <Heading as="h2" size="5">
        {t("schedule")}
      </Heading>
      {rows.length ? rows : <Text>{t("noScheduleOccurrences")}</Text>}
    </Card>
  );
}
