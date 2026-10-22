import {
  Button,
  Card,
  Checkbox,
  Heading,
  Text,
  TextField,
} from "@radix-ui/themes";
import { saveProgressionRuleAction, saveScheduleAction } from "@/api/actions";
import { usePageView } from "@/api/views";
import { useDictionary } from "@/lib/i18n";
import { FormSelect } from "./form-select";
import { SafeForm } from "./safe-form";
export function TemplatePlanning() {
  const t = useDictionary();
  const { planningTemplates: templates, schedules: current } =
    usePageView("workouts");
  const weekdays = [
    "weekdaySun",
    "weekdayMon",
    "weekdayTue",
    "weekdayWed",
    "weekdayThu",
    "weekdayFri",
    "weekdaySat",
  ] as const;
  return (
    <Card className="stack">
      <Heading as="h2" size="5">
        {t("schedule")}
      </Heading>
      <Text size="2">{t("scheduleHelp")}</Text>
      {!templates.length ? (
        <Text>{t("scheduleNoTemplates")}</Text>
      ) : (
        <>
          {weekdays.map((day, weekday) => (
            <SafeForm
              key={day}
              action={saveScheduleAction}
              error={t("saveFailed")}
              success={t("saved")}
            >
              <input type="hidden" name="weekday" value={weekday} />
              <Text>{t(day)}</Text>
              <FormSelect
                name="templateId"
                label={t("templates")}
                defaultValue={
                  current.find((s) => s.weekday === weekday)?.templateId ??
                  "none"
                }
                options={[
                  { value: "none", label: t("delete") },
                  ...templates.map((v) => ({ value: v.id, label: v.title })),
                ]}
              />
              <Button highContrast type="submit">
                {t("save")}
              </Button>
            </SafeForm>
          ))}
          {templates.map((template) => (
            <Card key={template.id} className="stack">
              <Heading as="h2" size="4">
                {template.title}
              </Heading>
              <Heading as="h2" size="3">
                {t("progression")}
              </Heading>
              {[
                ...new Map(
                  (template.sets ?? []).map((s) => [
                    s.exerciseId,
                    s.exercise?.defaultName,
                  ]),
                ).entries(),
              ].map(([exerciseId, name]) => (
                <SafeForm
                  key={exerciseId}
                  action={saveProgressionRuleAction}
                  error={t("saveFailed")}
                  success={t("saved")}
                >
                  <Text>{name}</Text>
                  <input type="hidden" name="templateId" value={template.id} />
                  <input type="hidden" name="exerciseId" value={exerciseId} />
                  <Text as="label">
                    {t("increment")}
                    <TextField.Root
                      name="increment"
                      type="number"
                      min={0.001}
                      max={100}
                      step="0.001"
                      defaultValue={
                        (template.rules ?? []).find(
                          (r) => r.exerciseId === exerciseId,
                        )?.increment ?? 2.5
                      }
                    />
                  </Text>
                  <Text as="label">
                    <Checkbox
                      name="disabled"
                      defaultChecked={
                        !(template.rules ?? []).some(
                          (r) => r.exerciseId === exerciseId,
                        )
                      }
                    />{" "}
                    {t("disableRule")}
                  </Text>
                  <Button highContrast type="submit">
                    {t("save")}
                  </Button>
                </SafeForm>
              ))}
            </Card>
          ))}
        </>
      )}
    </Card>
  );
}
