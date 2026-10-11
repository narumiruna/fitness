import { Button, Card, Checkbox, Heading, Text } from "@radix-ui/themes";
import { saveMetadataAction } from "@/app/actions/metadata";
import { getDictionary, type MessageKey } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { equipment, muscles } from "@/lib/training";
import { SafeForm } from "./safe-form";
export async function ExerciseMetadata({
  id,
  canEdit,
}: {
  id: string;
  canEdit: boolean;
}) {
  const t = await getDictionary();
  const e = await prisma.exercise.findUniqueOrThrow({
    where: { id },
    include: { muscles: true, equipment: true },
  });
  return (
    <Card className="stack">
      <Heading as="h2" size="5">
        {t("metadata")}
      </Heading>
      <Text size="2">{t("metadataHelp")}</Text>
      {canEdit ? (
        <SafeForm
          action={saveMetadataAction}
          error={t("saveFailed")}
          success={t("saved")}
        >
          <input type="hidden" name="exerciseId" value={id} />
          {(["PRIMARY", "SECONDARY"] as const).map((role) => (
            <fieldset key={role}>
              <legend>
                {t(role === "PRIMARY" ? "primaryMuscles" : "secondaryMuscles")}
              </legend>
              {muscles.map((m) => (
                <Text as="label" key={m} style={{ display: "block" }}>
                  <Checkbox
                    name={role === "PRIMARY" ? "primary" : "secondary"}
                    value={m}
                    defaultChecked={e.muscles.some(
                      (row) => row.muscle === m && row.role === role,
                    )}
                  />{" "}
                  {t(m)}
                </Text>
              ))}
            </fieldset>
          ))}
          <fieldset>
            <legend>{t("equipment")}</legend>
            {equipment.map((v) => (
              <Text as="label" key={v} style={{ display: "block" }}>
                <Checkbox
                  name="equipment"
                  value={v}
                  defaultChecked={e.equipment.some(
                    (row) => row.equipment === v,
                  )}
                />{" "}
                {t(v)}
              </Text>
            ))}
          </fieldset>
          <Button highContrast type="submit">
            {t("save")}
          </Button>
        </SafeForm>
      ) : (
        <Text>
          {e.muscles
            .map(
              (m) =>
                `${t(m.muscle as MessageKey)} (${t(m.role === "PRIMARY" ? "primary" : "secondary")})`,
            )
            .join(", ") || t("unknown")}{" "}
          —{" "}
          {e.equipment.map((v) => t(v.equipment as MessageKey)).join(", ") ||
            t("unknown")}
        </Text>
      )}
    </Card>
  );
}
