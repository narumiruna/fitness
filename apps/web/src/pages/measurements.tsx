import { formatDateKey } from "@narumitw/fitness-core/calendar";
import {
  Button,
  Card,
  Heading,
  Table,
  Text,
  TextField,
} from "@radix-ui/themes";
import {
  deleteMeasurementAction,
  saveGoalAction,
  saveMeasurementAction,
} from "@/api/actions";
import { usePageView } from "@/api/views";
import { ConfirmDelete } from "@/components/confirm-delete";
import { SafeForm } from "@/components/safe-form";
import { TrainingChart } from "@/components/training-chart";
import { useDictionary, useLocale } from "@/lib/i18n";

export default function MeasurementsPage() {
  const { records, goal, today } = usePageView("measurements");
  const t = useDictionary();
  const locale = useLocale();
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  return (
    <section className="stack measurements-page">
      <Heading as="h1" size="8">
        {t("measurements")}
      </Heading>
      <Card className="stack measurements-entry">
        <Heading as="h2" size="5">
          {t("addMeasurement")}
        </Heading>
        <SafeForm
          action={saveMeasurementAction}
          error={t("saveFailed")}
          success={t("saved")}
        >
          <div className="field-label">
            <Text as="label" className="field-label">
              {t("date")}
              <TextField.Root
                name="date"
                type="date"
                defaultValue={today}
                aria-describedby="measurement-date-help"
                required
              />
            </Text>
            <Text as="p" size="2" color="gray" m="0" id="measurement-date-help">
              {t("measurementDateHelp")}
            </Text>
          </div>
          <Text as="p" size="2" color="gray" m="0" id="measurement-values-help">
            {t("measurementsHelp")}
          </Text>
          <Text as="label" className="field-label">
            {t("weight")}
            <TextField.Root
              name="weight"
              type="number"
              min={0.001}
              max={500}
              step="any"
              aria-describedby="measurement-values-help"
            />
          </Text>
          <Text as="label" className="field-label">
            {t("waist")}
            <TextField.Root
              name="waist"
              type="number"
              min={0.001}
              max={300}
              step="any"
              aria-describedby="measurement-values-help"
            />
          </Text>
          <Button highContrast type="submit">
            {t("saveMeasurement")}
          </Button>
        </SafeForm>
      </Card>
      <section
        className="stack measurements-history"
        aria-labelledby="measurement-history-heading"
      >
        <Heading as="h2" size="5" id="measurement-history-heading">
          {t("history")}
        </Heading>
        {records.length ? (
          <section
            className="measurements-table-scroll"
            aria-label={t("measurementHistoryTable")}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to focus the local table scroll region.
            tabIndex={0}
          >
            <Table.Root className="measurements-table">
              <caption className="sr-only">
                {t("measurementHistoryTable")}
              </caption>
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeaderCell>{t("date")}</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>{t("weight")}</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>{t("waist")}</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>
                    {t("actions")}
                  </Table.ColumnHeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {records.map((r) => (
                  <Table.Row key={`${r.id}-${r.updatedAt.toISOString()}`}>
                    <Table.Cell>
                      <time dateTime={formatDateKey(r.date)}>
                        {dateFormatter.format(r.date)}
                      </time>
                    </Table.Cell>
                    <Table.Cell>{r.weight ?? "—"}</Table.Cell>
                    <Table.Cell>{r.waist ?? "—"}</Table.Cell>
                    <Table.Cell>
                      <details className="measurement-edit">
                        <summary>{t("editMeasurement")}</summary>
                        <SafeForm
                          action={saveMeasurementAction}
                          error={t("saveFailed")}
                          success={t("saved")}
                        >
                          <input
                            type="hidden"
                            name="date"
                            value={formatDateKey(r.date)}
                          />
                          <Text as="label" className="field-label">
                            {t("weight")}
                            <TextField.Root
                              name="weight"
                              type="number"
                              min={0.001}
                              max={500}
                              step="any"
                              defaultValue={r.weight ?? ""}
                            />
                          </Text>
                          <Text as="label" className="field-label">
                            {t("waist")}
                            <TextField.Root
                              name="waist"
                              type="number"
                              min={0.001}
                              max={300}
                              step="any"
                              defaultValue={r.waist ?? ""}
                            />
                          </Text>
                          <Button highContrast type="submit">
                            {t("saveMeasurement")}
                          </Button>
                          <Button
                            highContrast
                            variant="soft"
                            type="button"
                            onClick={(event) => {
                              const editor =
                                event.currentTarget.closest("details");
                              if (editor) {
                                editor.open = false;
                                editor.querySelector("summary")?.focus();
                              }
                            }}
                          >
                            {t("cancel")}
                          </Button>
                        </SafeForm>
                      </details>
                      <ConfirmDelete
                        action={deleteMeasurementAction}
                        fields={{ id: r.id }}
                        title={t("confirmDelete")}
                        description={t("deleteDescription")}
                        cancel={t("cancel")}
                        confirm={t("delete")}
                      />
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </section>
        ) : (
          <Text>{t("noMeasurements")}</Text>
        )}
      </section>
      {records.length
        ? (["weight", "waist"] as const).map((metric) => (
            <Card key={metric}>
              <Heading as="h2" size="5">
                {t(metric)}
              </Heading>
              <TrainingChart
                locale={locale}
                kind="line"
                label={t(metric)}
                dataLabel={t("chartData")}
                points={records
                  .filter((r) => r[metric] !== null)
                  .map((r) => ({
                    key: formatDateKey(r.date),
                    label: dateFormatter.format(r.date),
                    value: r[metric] as number,
                  }))}
                target={
                  metric === "weight" && goal?.weight
                    ? { value: goal.weight, label: t("goal") }
                    : undefined
                }
              />
            </Card>
          ))
        : null}
      <Card className="measurements-goal">
        <details>
          <summary>{t("goal")}</summary>
          <SafeForm
            action={saveGoalAction}
            error={t("saveFailed")}
            success={t("saved")}
          >
            <Text as="label" className="field-label">
              {t("goal")}
              <TextField.Root
                name="weight"
                type="number"
                min={0.001}
                max={500}
                step="any"
                defaultValue={goal?.weight ?? ""}
                aria-describedby="measurement-goal-help"
              />
            </Text>
            <Text as="p" size="2" color="gray" m="0" id="measurement-goal-help">
              {t("measurementGoalHelp")}
            </Text>
            <Button highContrast variant="soft" type="submit">
              {t("saveTarget")}
            </Button>
          </SafeForm>
        </details>
      </Card>
    </section>
  );
}
