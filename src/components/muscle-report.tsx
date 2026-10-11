import { Card, Heading, Table, Text } from "@radix-ui/themes";
import { parseDateKey } from "@/lib/calendar";
import { getDictionary, type MessageKey } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { addCalendarDays, muscleCounts, weekKey } from "@/lib/training";
export async function MuscleReport({ userId }: { userId: string }) {
  const t = await getDictionary();
  const start = weekKey(new Date());
  const sets = await prisma.workoutSet.findMany({
    where: {
      completed: true,
      type: "WORKING",
      workout: {
        userId,
        state: "COMPLETED",
        date: {
          gte: parseDateKey(start),
          lt: parseDateKey(addCalendarDays(start, 7)),
        },
      },
    },
    include: { exercise: { include: { muscles: true } } },
  });
  const counts = muscleCounts(sets);
  return (
    <Card className="stack">
      <Heading as="h2" size="5">
        {t("muscleReport")}: {start}
      </Heading>
      <Text size="2">{t("muscleReportHelp")}</Text>
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>{t("muscle")}</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>{t("primary")}</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>{t("secondary")}</Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {[...counts].map(([key, v]) => (
            <Table.Row key={key}>
              <Table.Cell>{t(key as MessageKey)}</Table.Cell>
              <Table.Cell>{v.primary}</Table.Cell>
              <Table.Cell>{v.secondary}</Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Card>
  );
}
