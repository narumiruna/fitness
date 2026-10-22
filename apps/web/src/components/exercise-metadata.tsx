import { equipment, muscles } from "@narumitw/fitness-core/training";
import { Button, Card, Checkbox, Text } from "@radix-ui/themes";
import { useLayoutEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { saveMetadataAction } from "@/api/actions";
import { usePageView } from "@/api/views";
import { type MessageKey, useDictionary } from "@/lib/i18n";
import { SafeForm } from "./safe-form";

export function ExerciseMetadataSummary() {
  const t = useDictionary();
  const { exercise } = usePageView("exercise");
  const primary = (exercise.muscles ?? []).filter(
    (row) => row.role === "PRIMARY",
  );
  const secondary = (exercise.muscles ?? []).filter(
    (row) => row.role === "SECONDARY",
  );
  return (
    <section className="meta-row" aria-label={t("metadata")}>
      <Text size="2" color="gray">
        {t("primaryMuscles")}:{" "}
        {primary.map((row) => t(row.muscle as MessageKey)).join(", ") ||
          t("unknown")}
      </Text>
      {secondary.length ? (
        <Text size="2" color="gray">
          {t("secondaryMuscles")}:{" "}
          {secondary.map((row) => t(row.muscle as MessageKey)).join(", ")}
        </Text>
      ) : null}
      <Text size="2" color="gray">
        {t("equipment")}:{" "}
        {(exercise.equipment ?? [])
          .map((row) => t(row.equipment as MessageKey))
          .join(", ") || t("unknown")}
      </Text>
    </section>
  );
}

export function ExerciseMetadata({ id }: { id: string }) {
  const t = useDictionary();
  const { exercise } = usePageView("exercise");
  const { hash } = useLocation();
  const editor = useRef<HTMLDetailsElement>(null);
  useLayoutEffect(() => {
    if (hash === "#edit-exercise-metadata" && editor.current) {
      editor.current.open = true;
      editor.current.scrollIntoView();
    }
  }, [hash]);
  return (
    <Card asChild>
      <details
        id="edit-exercise-metadata"
        ref={editor}
        className="dashboard-tools"
      >
        <summary>{t("editExerciseMetadata")}</summary>
        <Text as="p" size="2">
          {t("metadataHelp")}
        </Text>
        <SafeForm
          action={async (data) => {
            try {
              return await saveMetadataAction(data);
            } finally {
              if (editor.current) editor.current.open = true;
            }
          }}
          error={t("saveFailed")}
          success={t("saved")}
        >
          <input type="hidden" name="exerciseId" value={id} />
          {(["PRIMARY", "SECONDARY"] as const).map((role) => (
            <fieldset key={role}>
              <legend>
                {t(role === "PRIMARY" ? "primaryMuscles" : "secondaryMuscles")}
              </legend>
              {muscles.map((muscle) => (
                <Text as="label" key={muscle} style={{ display: "block" }}>
                  <Checkbox
                    name={role === "PRIMARY" ? "primary" : "secondary"}
                    value={muscle}
                    defaultChecked={(exercise.muscles ?? []).some(
                      (row) => row.muscle === muscle && row.role === role,
                    )}
                  />{" "}
                  {t(muscle)}
                </Text>
              ))}
            </fieldset>
          ))}
          <fieldset>
            <legend>{t("equipment")}</legend>
            {equipment.map((tool) => (
              <Text as="label" key={tool} style={{ display: "block" }}>
                <Checkbox
                  name="equipment"
                  value={tool}
                  defaultChecked={(exercise.equipment ?? []).some(
                    (row) => row.equipment === tool,
                  )}
                />{" "}
                {t(tool)}
              </Text>
            ))}
          </fieldset>
          <Button highContrast type="submit">
            {t("save")}
          </Button>
        </SafeForm>
      </details>
    </Card>
  );
}
