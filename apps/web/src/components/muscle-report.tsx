import { muscleCounts, weekKey } from "@narumitw/fitness-core/training";
import { Card, Heading, Table, Text } from "@radix-ui/themes";
import { calendarDate, usePageView } from "@/api/views";
import { type MessageKey, useDictionary } from "@/lib/i18n";
export function MuscleReport() {
  const t = useDictionary();
  const { muscleSets: sets, today } = usePageView("stats");
  const start = weekKey(calendarDate(today));
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
