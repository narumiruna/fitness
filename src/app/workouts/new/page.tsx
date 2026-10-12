import { randomUUID } from "node:crypto";
import { Button, Card, Text, TextArea, TextField } from "@radix-ui/themes";
import NextLink from "next/link";
import { createWorkoutAction } from "@/app/actions/workouts";
import { PageHeader } from "@/components/dashboard";
import { SafeForm } from "@/components/safe-form";
import { WorkoutDraftKey } from "@/components/workout-draft-key";
import { requireUser } from "@/lib/auth";
import { formatDateKey, parseDateKey } from "@/lib/calendar";
import { getDictionary } from "@/lib/i18n";

export default async function NewWorkoutPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string | string[] }>;
}) {
  await requireUser();
  const t = await getDictionary();
  const params = await searchParams;
  const date = Array.isArray(params.date) ? params.date[0] : params.date;
  const initialDate = formatDateKey(parseDateKey(date) ?? new Date());
  return (
    <section className="stack narrow">
      <PageHeader title={t("createWorkout")} description={t("workoutsIntro")} />
      <Card>
        <SafeForm
          action={createWorkoutAction}
          error={t("saveFailed")}
          success={t("saved")}
          errors={{ invalidWorkoutInput: t("invalidWorkoutInput") }}
        >
          <WorkoutDraftKey initialKey={randomUUID()} />
          <Text as="label" className="field-label">
            {t("date")}
            <TextField.Root
              name="date"
              type="date"
              defaultValue={initialDate}
              required
            />
          </Text>
          <Text as="label" className="field-label">
            {t("workoutTitle")}
            <TextField.Root
              name="title"
              maxLength={120}
              placeholder={t("workoutTitlePlaceholder")}
            />
          </Text>
          <Text as="label" className="field-label">
            {t("notes")}
            <TextArea
              name="notes"
              maxLength={2000}
              placeholder={t("workoutNotesPlaceholder")}
            />
          </Text>
          <div className="card-actions">
            <Button highContrast type="submit">
              {t("createWorkout")}
            </Button>
            <Button highContrast variant="soft" asChild>
              <NextLink href="/workouts">{t("cancel")}</NextLink>
            </Button>
          </div>
        </SafeForm>
      </Card>
    </section>
  );
}
