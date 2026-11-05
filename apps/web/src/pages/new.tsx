import { Button, Card, Text } from "@radix-ui/themes";
import { Link as RouterLink } from "react-router-dom";
import { createWorkoutAction } from "@/api/actions";
import { usePageView } from "@/api/views";
import { PageHeader } from "@/components/dashboard";
import { SafeForm } from "@/components/safe-form";
import { WorkoutDraftKey } from "@/components/workout-draft-key";
import { useDictionary } from "@/lib/i18n";

export default function NewWorkoutPage() {
  const { initialDate, key } = usePageView("new");
  const t = useDictionary();
  return (
    <section className="stack narrow">
      <PageHeader title={t("createWorkout")} />
      <Card>
        <SafeForm
          action={createWorkoutAction}
          error={t("saveFailed")}
          success={t("saved")}
          errors={{ invalidWorkoutInput: t("invalidWorkoutInput") }}
        >
          <WorkoutDraftKey initialKey={key} />
          <input type="hidden" name="date" value={initialDate} />
          <Text as="p" size="2" color="gray">
            {t("workoutQuickStartHelp")}
          </Text>
          <Text as="p" size="2">
            {t("date")}: <time dateTime={initialDate}>{initialDate}</time>
          </Text>
          <div className="card-actions">
            <Button highContrast type="submit">
              {t("createWorkout")}
            </Button>
            <Button highContrast variant="soft" asChild>
              <RouterLink to="/workouts">{t("cancel")}</RouterLink>
            </Button>
          </div>
        </SafeForm>
      </Card>
    </section>
  );
}
