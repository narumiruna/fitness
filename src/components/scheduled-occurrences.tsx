import { Badge, Card, Heading, Link, Text } from "@radix-ui/themes";
import NextLink from "next/link";
import { formatDateKey } from "@/lib/calendar";
import { getDictionary } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { StartSessionForm } from "./session-panel";
export async function ScheduledOccurrences({
  userId,
  start,
  end,
}: {
  userId: string;
  start: Date;
  end: Date;
}) {
  const t = await getDictionary();
  const schedules = await prisma.templateSchedule.findMany({
    where: {
      userId,
      effectiveFrom: { lt: end },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: start } }],
    },
  });
  const sessions = await prisma.workout.findMany({
    where: { userId, plannedDate: { gte: start, lt: end } },
    include: { sets: { where: { completed: true }, select: { id: true } } },
  });
  const rows = [];
  const today = formatDateKey(new Date());
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
      session?.state === "COMPLETED" && session.sets.length > 0
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
            <NextLink href={`/workouts/${session.id}`}>{t("view")}</NextLink>
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
