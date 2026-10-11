import {
  Badge,
  Button,
  Card,
  Flex,
  Grid,
  Heading,
  Link,
  Table,
  Text,
  TextArea,
  TextField,
} from "@radix-ui/themes";
import NextLink from "next/link";
import { notFound } from "next/navigation";
import {
  createWorkoutSetAction,
  deleteWorkoutAction,
  deleteWorkoutSetAction,
  duplicateWorkoutAction,
  saveWorkoutTemplateAction,
  updateWorkoutAction,
  updateWorkoutSetAction,
} from "@/app/actions/workouts";
import { ConfirmDelete } from "@/components/confirm-delete";
import { FormSelect } from "@/components/form-select";
import { PreviousSession } from "@/components/previous-session";
import { SessionPanel } from "@/components/session-panel";
import { requireUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { priorSessions } from "@/lib/workout-history";

export default async function WorkoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const t = await getDictionary();
  const { id } = await params;
  const workout = await prisma.workout.findFirst({
    where: {
      id,
      userId: user.id,
    },
    include: {
      sets: {
        include: {
          exercise: true,
        },
        orderBy: { order: "asc" },
      },
    },
  });

  if (!workout) {
    notFound();
  }

  const exercises = await prisma.exercise.findMany({
    orderBy: { defaultName: "asc" },
  });
  const history = await priorSessions(
    user.id,
    workout.id,
    workout.date,
    exercises.map((e) => e.id),
  );
  const today = formatDateInput(new Date());
  const workoutDate = formatDateInput(workout.date);
  const nextOrder =
    workout.sets.reduce((max, set) => Math.max(max, set.order), 0) + 1;
  const performedSets = workout.sets.filter((s) => s.completed);
  const totalReps = performedSets.reduce((total, set) => total + set.reps, 0);
  const totalVolume = performedSets.reduce(
    (total, set) => total + set.weight * set.reps,
    0,
  );
  const exerciseCount = new Set(performedSets.map((set) => set.exerciseId))
    .size;
  if (workout.state !== "COMPLETED")
    return (
      <section className="stack">
        <Heading as="h1" size="8">
          {workout.title || t("workout")}
        </Heading>
        <Text>{workoutDate}</Text>
        <SessionPanel workout={workout} userId={user.id} />
      </section>
    );

  return (
    <section className="stack">
      <div className="page-header">
        <div>
          <Heading as="h1" size="8">
            {workout.title || t("workout")}
          </Heading>
          <Text as="p" size="2" color="gray">
            {workout.date.toLocaleDateString("en")}
          </Text>
        </div>
        <div className="card-actions">
          <form action={duplicateWorkoutAction}>
            <input name="sourceWorkoutId" type="hidden" value={workout.id} />
            <input name="date" type="hidden" value={today} />
            <Button highContrast variant="soft" type="submit">
              {t("repeatWorkout")}
            </Button>
          </form>
          <ConfirmDelete
            action={deleteWorkoutAction}
            fields={{ workoutId: workout.id }}
            title={t("confirmDelete")}
            description={t("deleteDescription")}
            cancel={t("cancel")}
            confirm={t("delete")}
          />
        </div>
      </div>

      <SessionPanel workout={workout} userId={user.id} />
      <section className="stats-card-grid" aria-label={t("overview")}>
        <SummaryCard
          label={t("totalSets")}
          value={formatInteger(performedSets.length)}
        />
        <SummaryCard label={t("totalReps")} value={formatInteger(totalReps)} />
        <SummaryCard
          label={t("totalVolume")}
          value={formatNumber(totalVolume)}
        />
        <SummaryCard
          label={t("exercisesMetric")}
          value={formatInteger(exerciseCount)}
        />
      </section>

      {workout.notes ? (
        <Card>
          <Text as="p" size="2">
            {workout.notes}
          </Text>
        </Card>
      ) : null}

      <Grid columns={{ initial: "1", md: "2" }} gap="4">
        <Flex direction="column" gap="3">
          <Card asChild>
            <form action={updateWorkoutAction} className="form-grid">
              <Heading as="h2" size="5">
                {t("editWorkout")}
              </Heading>
              <input name="workoutId" type="hidden" value={workout.id} />
              <Text as="label" size="2" weight="medium" className="field-label">
                {t("date")}
                <TextField.Root
                  defaultValue={workoutDate}
                  name="date"
                  required
                  type="date"
                />
              </Text>
              <Text as="label" size="2" weight="medium" className="field-label">
                {t("workoutTitle")}
                <TextField.Root
                  defaultValue={workout.title ?? ""}
                  name="title"
                />
              </Text>
              <Text as="label" size="2" weight="medium" className="field-label">
                {t("notes")}
                <TextArea
                  aria-label={t("notes")}
                  defaultValue={workout.notes ?? ""}
                  name="notes"
                />
              </Text>
              <Button highContrast type="submit">
                {t("updateWorkout")}
              </Button>
            </form>
          </Card>

          <Card asChild>
            <div className="stack">
              <Heading as="h2" size="5">
                {t("addSet")}
              </Heading>
              <form className="form-grid" action={createWorkoutSetAction}>
                <input name="workoutId" type="hidden" value={workout.id} />
                <Text
                  as="label"
                  size="2"
                  weight="medium"
                  className="field-label"
                >
                  {t("exercise")}
                  <PreviousSession
                    exercises={exercises}
                    history={history}
                    labels={{
                      exercise: t("exercise"),
                      previous: t("previousSession"),
                      empty: t("noPreviousSession"),
                      copy: t("copyValues"),
                    }}
                  />
                </Text>
                <Text as="label">
                  {t("setType")}
                  <FormSelect
                    name="type"
                    label={t("setType")}
                    options={[
                      { value: "WORKING", label: t("WORKING") },
                      { value: "WARMUP", label: t("WARMUP") },
                    ]}
                  />
                </Text>
                <Text as="label">
                  {t("rir")}
                  <TextField.Root
                    name="rir"
                    type="number"
                    min={0}
                    max={10}
                    step="0.5"
                  />
                </Text>
                <Text size="2">{t("rirHelp")}</Text>
                <div className="form-grid two">
                  <Text
                    as="label"
                    size="2"
                    weight="medium"
                    className="field-label"
                  >
                    {t("weight")}
                    <TextField.Root
                      min="0"
                      name="weight"
                      required
                      step="0.5"
                      type="number"
                    />
                  </Text>
                  <Text
                    as="label"
                    size="2"
                    weight="medium"
                    className="field-label"
                  >
                    {t("reps")}
                    <TextField.Root
                      min="1"
                      name="reps"
                      required
                      type="number"
                    />
                  </Text>
                  <Text
                    as="label"
                    size="2"
                    weight="medium"
                    className="field-label"
                  >
                    {t("order")}
                    <TextField.Root
                      min="1"
                      name="order"
                      required
                      type="number"
                      defaultValue={nextOrder}
                    />
                  </Text>
                </div>
                <Text
                  as="label"
                  size="2"
                  weight="medium"
                  className="field-label"
                >
                  {t("notes")}
                  <TextArea aria-label={t("notes")} name="notes" />
                </Text>
                <Button highContrast type="submit">
                  {t("addSet")}
                </Button>
              </form>
            </div>
          </Card>

          <Card asChild>
            <form action={saveWorkoutTemplateAction} className="form-grid">
              <Heading as="h2" size="5">
                {t("saveAsTemplate")}
              </Heading>
              <input name="workoutId" type="hidden" value={workout.id} />
              <Text as="label" size="2" weight="medium" className="field-label">
                {t("templateName")}
                <TextField.Root
                  defaultValue={workout.title || t("workout")}
                  name="title"
                  required
                />
              </Text>
              <Button highContrast variant="soft" type="submit">
                {t("saveAsTemplate")}
              </Button>
            </form>
          </Card>
        </Flex>

        <Card asChild>
          <div className="stack">
            <div className="section-heading">
              <Heading as="h2" size="5">
                {t("setsMetric")}
              </Heading>
              <Badge color="gray">{workout.sets.length}</Badge>
            </div>

            {workout.sets.length === 0 ? (
              <Text as="p" size="2" color="gray">
                {t("noSets")}
              </Text>
            ) : (
              <>
                <div className="mobile-list">
                  {workout.sets.map((set) => (
                    <Card asChild key={setFormKey(set)}>
                      <article className="detail-list-item">
                        <form
                          className="form-grid"
                          action={updateWorkoutSetAction}
                        >
                          <input
                            name="workoutId"
                            type="hidden"
                            value={workout.id}
                          />
                          <input name="setId" type="hidden" value={set.id} />
                          <Text as="label">
                            {t("setType")}
                            <FormSelect
                              name="type"
                              label={t("setType")}
                              defaultValue={set.type}
                              options={[
                                { value: "WORKING", label: t("WORKING") },
                                { value: "WARMUP", label: t("WARMUP") },
                              ]}
                            />
                          </Text>
                          <Text as="label">
                            {t("rir")}
                            <TextField.Root
                              name="rir"
                              type="number"
                              min={0}
                              max={10}
                              step="0.5"
                              defaultValue={set.rir ?? ""}
                            />
                          </Text>
                          <div className="detail-list-header">
                            <div>
                              <Badge color="gray" variant="soft">
                                #{set.order}
                              </Badge>
                              <Heading as="h3" size="4">
                                <Link highContrast asChild>
                                  <NextLink
                                    href={`/exercises/${set.exercise.id}`}
                                  >
                                    {set.exercise.defaultName}
                                  </NextLink>
                                </Link>
                              </Heading>
                            </div>
                          </div>
                          <Text
                            as="label"
                            size="2"
                            weight="medium"
                            className="field-label"
                          >
                            {t("exercise")}
                            <FormSelect
                              defaultValue={set.exerciseId}
                              name="exerciseId"
                              required
                              key={set.exerciseId}
                              label={t("exercise")}
                              options={exercises.map((exercise) => ({
                                value: exercise.id,
                                label: exercise.defaultName,
                              }))}
                            />
                          </Text>
                          <div className="form-grid two">
                            <Text
                              as="label"
                              size="2"
                              weight="medium"
                              className="field-label"
                            >
                              {t("weight")}
                              <TextField.Root
                                defaultValue={set.weight}
                                min="0"
                                name="weight"
                                required
                                step="0.5"
                                type="number"
                              />
                            </Text>
                            <Text
                              as="label"
                              size="2"
                              weight="medium"
                              className="field-label"
                            >
                              {t("reps")}
                              <TextField.Root
                                defaultValue={set.reps}
                                min="1"
                                name="reps"
                                required
                                type="number"
                              />
                            </Text>
                            <Text
                              as="label"
                              size="2"
                              weight="medium"
                              className="field-label"
                            >
                              {t("order")}
                              <TextField.Root
                                defaultValue={set.order}
                                min="1"
                                name="order"
                                required
                                type="number"
                              />
                            </Text>
                          </div>
                          <Text
                            as="label"
                            size="2"
                            weight="medium"
                            className="field-label"
                          >
                            {t("notes")}
                            <TextArea
                              aria-label={t("notes")}
                              defaultValue={set.notes ?? ""}
                              name="notes"
                            />
                          </Text>
                          <Button highContrast variant="soft" type="submit">
                            {t("updateSet")}
                          </Button>
                        </form>
                        <ConfirmDelete
                          action={deleteWorkoutSetAction}
                          fields={{ workoutId: workout.id, setId: set.id }}
                          title={t("confirmDelete")}
                          description={t("deleteDescription")}
                          cancel={t("cancel")}
                          confirm={t("delete")}
                        />
                      </article>
                    </Card>
                  ))}
                </div>

                <div className="table-scroll desktop-table">
                  <Table.Root variant="surface" className="editable-table">
                    <Table.Header>
                      <Table.Row>
                        <Table.ColumnHeaderCell>
                          {t("order")}
                        </Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell>
                          {t("exercise")}
                        </Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell>
                          {t("weight")}
                        </Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell>
                          {t("reps")}
                        </Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell>
                          {t("notes")}
                        </Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell>
                          {t("actions")}
                        </Table.ColumnHeaderCell>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {workout.sets.map((set) => {
                        const formId = `edit-set-${set.id}`;

                        return (
                          <Table.Row key={setFormKey(set)}>
                            <Table.Cell>
                              <TextField.Root
                                aria-label={t("order")}
                                defaultValue={set.order}
                                form={formId}
                                min="1"
                                name="order"
                                required
                                type="number"
                              />
                            </Table.Cell>
                            <Table.Cell>
                              <FormSelect
                                defaultValue={set.exerciseId}
                                form={formId}
                                name="exerciseId"
                                required
                                key={set.exerciseId}
                                label={t("exercise")}
                                options={exercises.map((exercise) => ({
                                  value: exercise.id,
                                  label: exercise.defaultName,
                                }))}
                              />
                              <Link highContrast asChild>
                                <NextLink
                                  className="table-link"
                                  href={`/exercises/${set.exercise.id}`}
                                >
                                  {t("history")}
                                </NextLink>
                              </Link>
                            </Table.Cell>
                            <Table.Cell>
                              <TextField.Root
                                aria-label={t("weight")}
                                defaultValue={set.weight}
                                form={formId}
                                min="0"
                                name="weight"
                                required
                                step="0.5"
                                type="number"
                              />
                            </Table.Cell>
                            <Table.Cell>
                              <TextField.Root
                                aria-label={t("reps")}
                                defaultValue={set.reps}
                                form={formId}
                                min="1"
                                name="reps"
                                required
                                type="number"
                              />
                            </Table.Cell>
                            <Table.Cell>
                              <FormSelect
                                name="type"
                                form={formId}
                                label={t("setType")}
                                defaultValue={set.type}
                                options={[
                                  { value: "WORKING", label: t("WORKING") },
                                  { value: "WARMUP", label: t("WARMUP") },
                                ]}
                              />
                              <TextField.Root
                                aria-label={t("rir")}
                                name="rir"
                                form={formId}
                                type="number"
                                min={0}
                                max={10}
                                step="0.5"
                                defaultValue={set.rir ?? ""}
                              />
                              <TextField.Root
                                aria-label={t("notes")}
                                defaultValue={set.notes ?? ""}
                                form={formId}
                                name="notes"
                              />
                            </Table.Cell>
                            <Table.Cell>
                              <div className="table-actions">
                                <form
                                  id={formId}
                                  action={updateWorkoutSetAction}
                                >
                                  <input
                                    name="workoutId"
                                    type="hidden"
                                    value={workout.id}
                                  />
                                  <input
                                    name="setId"
                                    type="hidden"
                                    value={set.id}
                                  />
                                  <Button
                                    highContrast
                                    variant="soft"
                                    type="submit"
                                  >
                                    {t("save")}
                                  </Button>
                                </form>
                                <ConfirmDelete
                                  action={deleteWorkoutSetAction}
                                  fields={{
                                    workoutId: workout.id,
                                    setId: set.id,
                                  }}
                                  title={t("confirmDelete")}
                                  description={t("deleteDescription")}
                                  cancel={t("cancel")}
                                  confirm={t("delete")}
                                />
                              </div>
                            </Table.Cell>
                          </Table.Row>
                        );
                      })}
                    </Table.Body>
                  </Table.Root>
                </div>
              </>
            )}
          </div>
        </Card>
      </Grid>
    </section>
  );
}

// Remount both editors after a saved change so hidden inputs cannot keep stale values.
function setFormKey(set: {
  id: string;
  exerciseId: string;
  order: number;
  weight: number;
  reps: number;
  notes: string | null;
}) {
  return JSON.stringify([
    set.id,
    set.exerciseId,
    set.order,
    set.weight,
    set.reps,
    set.notes,
    "type" in set ? set.type : null,
    "rir" in set ? set.rir : null,
  ]);
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card asChild>
      <article className="stats-card">
        <Text size="2" color="gray">
          {label}
        </Text>
        <Text size="7" weight="bold">
          {value}
        </Text>
      </article>
    </Card>
  );
}

function formatDateInput(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 1,
  }).format(value);
}
