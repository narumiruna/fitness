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
} from "@/app/actions/measurements";
import { ConfirmDelete } from "@/components/confirm-delete";
import { SafeForm } from "@/components/safe-form";
import { TrainingChart } from "@/components/training-chart";
import { requireUser } from "@/lib/auth";
import { formatDateKey } from "@/lib/calendar";
import { getDictionary, getLocale } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
export default async function MeasurementsPage() {
  const user = await requireUser();
  const t = await getDictionary();
  const locale = await getLocale();
  const [records, goal] = await Promise.all([
    prisma.bodyMeasurement.findMany({
      where: { userId: user.id },
      orderBy: { date: "asc" },
    }),
    prisma.bodyGoal.findUnique({ where: { userId: user.id } }),
  ]);
  return (
    <section className="stack">
      <Heading as="h1" size="8">
        {t("measurements")}
      </Heading>
      <Text>{t("measurementsHelp")}</Text>
      <Card>
        <SafeForm
          action={saveMeasurementAction}
          error={t("saveFailed")}
          success={t("saved")}
        >
          <Text as="label">
            {t("date")}
            <TextField.Root
              name="date"
              type="date"
              defaultValue={formatDateKey(new Date())}
              required
            />
          </Text>
          <Text as="label">
            {t("weight")}
            <TextField.Root
              name="weight"
              type="number"
              min={0.001}
              max={500}
              step="any"
            />
          </Text>
          <Text as="label">
            {t("waist")}
            <TextField.Root
              name="waist"
              type="number"
              min={0.001}
              max={300}
              step="any"
            />
          </Text>
          <Button highContrast type="submit">
            {t("save")}
          </Button>
        </SafeForm>
      </Card>
      <Card>
        <SafeForm
          action={saveGoalAction}
          error={t("saveFailed")}
          success={t("saved")}
        >
          <Text as="label">
            {t("goal")}
            <TextField.Root
              name="weight"
              type="number"
              min={0.001}
              max={500}
              step="any"
              defaultValue={goal?.weight ?? ""}
            />
          </Text>
          <Button highContrast type="submit">
            {t("save")}
          </Button>
        </SafeForm>
      </Card>
      {records.length ? (
        (["weight", "waist"] as const).map((metric) => (
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
                  label: formatDateKey(r.date),
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
      ) : (
        <Text>{t("noMeasurements")}</Text>
      )}
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>{t("date")}</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>{t("weight")}</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>{t("waist")}</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>{t("actions")}</Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {records.map((r) => (
            <Table.Row key={`${r.id}-${r.updatedAt.toISOString()}`}>
              <Table.Cell>{formatDateKey(r.date)}</Table.Cell>
              <Table.Cell>{r.weight ?? "—"}</Table.Cell>
              <Table.Cell>{r.waist ?? "—"}</Table.Cell>
              <Table.Cell>
                <details>
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
                    <Text as="label">
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
                    <Text as="label">
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
                      {t("save")}
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
  );
}
