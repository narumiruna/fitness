import { consistency } from "@narumitw/fitness-core/training";
import {
  Badge,
  Button,
  Card,
  Heading,
  Table,
  Text,
  TextField,
} from "@radix-ui/themes";
import { calendarDate, usePageView } from "@/api/views";
import { ActionForm } from "@/components/action-form";
import { useDictionary } from "@/lib/i18n";
export function ConsistencyReport({
  year,
  range,
  scope,
}: {
  year: number;
  range: string;
  scope: "range" | "all";
}) {
  const t = useDictionary();
  const { consistencyHistory: history, today } = usePageView("stats");
  const now = calendarDate(today);
  const data = consistency(
    history.map((w) => w.date),
    now,
    year,
  );
  return (
    <Card className="stack">
      <Heading as="h2" size="5">
        {t("consistency")}
      </Heading>
      <Text size="2">{t("streakRule")}</Text>
      <Text>
        {t("currentStreak")}: {data.current} — {t("longestStreak")}:{" "}
        {data.longest}
      </Text>
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>{t("date")}</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>{t("trainingDays")}</Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {data.recent.map((w) => (
            <Table.Row key={w.start}>
              <Table.Cell>{w.start}</Table.Cell>
              <Table.Cell>{w.days}</Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
      <ActionForm action="/stats" className="card-actions" key={year}>
        <input type="hidden" name="range" value={range} />
        <input type="hidden" name="records" value={scope} />
        <Text as="label">
          {t("year")}
          <TextField.Root
            name="year"
            type="number"
            min={1900}
            max={9999}
            defaultValue={year}
          />
        </Text>
        <Button highContrast type="submit">
          {t("applyFilters")}
        </Button>
      </ActionForm>
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill,minmax(28px,1fr))",
          gap: 4,
        }}
        aria-label={t("trainingDays")}
      >
        {data.heatmap.map((d) => (
          <Badge
            key={d.date}
            tabIndex={0}
            color={d.count ? "teal" : "gray"}
            aria-label={`${d.date}: ${d.count} ${t("trainingDays")}`}
            title={`${d.date}: ${d.count}`}
          >
            {d.date.slice(-2)}
          </Badge>
        ))}
      </section>
    </Card>
  );
}
