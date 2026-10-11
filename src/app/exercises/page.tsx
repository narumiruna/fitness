import { PlusIcon } from "@radix-ui/react-icons";
import {
  Badge,
  Button,
  Callout,
  Card,
  Heading,
  Text,
  TextField,
} from "@radix-ui/themes";
import NextLink from "next/link";
import { Collapsible } from "radix-ui";
import {
  createExerciseAction,
  createExerciseAliasAction,
} from "@/app/actions/exercises";
import { EmptyState, MetricCard, PageHeader } from "@/components/dashboard";
import { FormSelect } from "@/components/form-select";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth";
import { formatDateKey } from "@/lib/calendar";
import { normalizeExerciseAlias } from "@/lib/exercises";
import { getDictionary } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";

export default async function ExercisesPage({
  searchParams,
}: {
  searchParams: Promise<{
    created?: string;
    q?: string;
    sort?: string;
    error?: string;
  }>;
}) {
  const user = await requireUser();
  const t = await getDictionary();
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const createdExerciseId = params.created?.trim() ?? "";
  const sort =
    params.sort === "desc" || params.sort === "recent" ? params.sort : "asc";
  const normalizedQuery = normalizeExerciseAlias(query);
  const [exercises, totalExerciseCount, totalAliasCount, usedSets] =
    await Promise.all([
      prisma.exercise.findMany({
        where: query
          ? {
              OR: [
                { defaultName: { contains: query } },
                { names: { some: { name: { contains: query } } } },
                {
                  aliases: {
                    some: { normalizedAlias: { contains: normalizedQuery } },
                  },
                },
              ],
            }
          : undefined,
        include: {
          aliases: { orderBy: [{ locale: "asc" }, { alias: "asc" }] },
        },
        orderBy: { defaultName: sort === "desc" ? "desc" : "asc" },
      }),
      prisma.exercise.count(),
      prisma.exerciseAlias.count(),
      prisma.workoutSet.findMany({
        where: { workout: { userId: user.id } },
        select: {
          exerciseId: true,
          exercise: { select: { defaultName: true } },
          workout: { select: { date: true } },
        },
        orderBy: { workout: { date: "desc" } },
      }),
    ]);
  const usage = new Map<string, { name: string; date: Date; count: number }>();
  for (const set of usedSets) {
    const existing = usage.get(set.exerciseId);
    if (existing) existing.count++;
    else
      usage.set(set.exerciseId, {
        name: set.exercise.defaultName,
        date: set.workout.date,
        count: 1,
      });
  }
  if (sort === "recent")
    exercises.sort(
      (a, b) =>
        (usage.get(b.id)?.date.getTime() ?? 0) -
          (usage.get(a.id)?.date.getTime() ?? 0) ||
        a.defaultName.localeCompare(b.defaultName),
    );
  const recent = [...usage.entries()].slice(0, 5);
  return (
    <section className="stack exercises-page">
      <PageHeader title={t("exercises")} description={t("exercisePageIntro")}>
        <Button highContrast asChild>
          <a href="#new-exercise">
            <PlusIcon aria-hidden="true" />
            {t("newExerciseAction")}
          </a>
        </Button>
      </PageHeader>
      {params.error === "duplicate" || params.error === "alias" ? (
        <Callout.Root color="red" role="alert">
          <Callout.Text>
            {t(
              params.error === "alias" ? "duplicateAlias" : "duplicateExercise",
            )}
          </Callout.Text>
        </Callout.Root>
      ) : null}
      {totalExerciseCount > 0 ? (
        <section className="stats-card-grid" aria-label={t("overview")}>
          <MetricCard
            label={t("totalExercises")}
            value={String(totalExerciseCount)}
          />
          <MetricCard label={t("usedExercises")} value={String(usage.size)} />
          <MetricCard label={t("aliases")} value={String(totalAliasCount)} />
          <MetricCard
            label={t(query ? "results" : "showing")}
            value={String(exercises.length)}
          />
        </section>
      ) : null}
      <div className="dashboard-columns">
        <Card asChild>
          <section className="stack">
            <div className="section-heading">
              <Heading as="h2" size="5">
                {t("exerciseLibrary")}
              </Heading>
              <Badge color="gray">{exercises.length}</Badge>
            </div>
            {totalExerciseCount > 0 ? (
              <form
                className="library-filters"
                action="/exercises"
                key={`${query}:${sort}`}
              >
                <Text as="label" size="2" className="field-label">
                  {t("search")}
                  <TextField.Root
                    name="q"
                    defaultValue={query}
                    placeholder={t("exerciseSearchPlaceholder")}
                  />
                </Text>
                <Text as="label" size="2" className="field-label">
                  {t("sort")}
                  <FormSelect
                    name="sort"
                    label={t("sort")}
                    defaultValue={sort}
                    options={[
                      { value: "asc", label: t("nameAscending") },
                      { value: "desc", label: t("nameDescending") },
                      { value: "recent", label: t("recentlyUsed") },
                    ]}
                  />
                </Text>
                <div className="toolbar-actions">
                  <Button highContrast variant="soft" type="submit">
                    {t("search")}
                  </Button>
                  {query || sort !== "asc" ? (
                    <Button highContrast asChild variant="ghost">
                      <NextLink href="/exercises">{t("clearSearch")}</NextLink>
                    </Button>
                  ) : null}
                </div>
              </form>
            ) : null}
            {exercises.length === 0 ? (
              <EmptyState
                title={t(
                  totalExerciseCount
                    ? "noExerciseResults"
                    : "noExerciseLibrary",
                )}
                description={t("noExerciseResultsHint")}
              />
            ) : (
              <div className="exercise-list">
                {exercises.map((exercise) => (
                  <article
                    className={[
                      "exercise-row",
                      exercise.id === createdExerciseId ? "highlight" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    key={exercise.id}
                  >
                    <div className="exercise-row-main">
                      <Heading as="h3" size="3">
                        <NextLink
                          className="title-link"
                          href={`/exercises/${exercise.id}`}
                        >
                          {exercise.defaultName}
                        </NextLink>
                      </Heading>
                      <div className="meta-row">
                        <Text size="1" color="gray">
                          {usage.get(exercise.id)
                            ? `${t("lastUsed")}: ${formatDateKey(usage.get(exercise.id)?.date as Date)}`
                            : t("neverUsed")}
                        </Text>
                        <Badge color="gray">
                          {usage.get(exercise.id)?.count ?? 0} {t("sets")}
                        </Badge>
                        {exercise.id === createdExerciseId ? (
                          <Badge>{t("newExercise")}</Badge>
                        ) : null}
                      </div>
                    </div>
                    <div className="alias-list">
                      {exercise.aliases.length ? (
                        exercise.aliases.map((alias) => (
                          <Badge color="gray" variant="soft" key={alias.id}>
                            {alias.alias}
                            <Text size="1" color="gray">
                              {alias.locale}
                            </Text>
                          </Badge>
                        ))
                      ) : (
                        <Text size="2" color="gray">
                          {t("noAliases")}
                        </Text>
                      )}
                    </div>
                    <div className="exercise-actions">
                      <Button highContrast asChild size="1" variant="soft">
                        <NextLink href={`/exercises/${exercise.id}`}>
                          {t("history")}
                        </NextLink>
                      </Button>
                      <Collapsible.Root className="inline-disclosure">
                        <Collapsible.Trigger asChild>
                          <Button
                            highContrast
                            size="1"
                            variant="ghost"
                            type="button"
                          >
                            {t("addAlias")}
                          </Button>
                        </Collapsible.Trigger>
                        <Collapsible.Content>
                          <form
                            className="form-grid two compact-form"
                            action={createExerciseAliasAction}
                          >
                            <input
                              name="exerciseId"
                              type="hidden"
                              value={exercise.id}
                            />
                            <Text as="label" size="2" className="field-label">
                              {t("locale")}
                              <TextField.Root
                                defaultValue="zh-TW"
                                name="locale"
                                minLength={2}
                                maxLength={12}
                                required
                              />
                            </Text>
                            <Text as="label" size="2" className="field-label">
                              {t("alias")}
                              <TextField.Root
                                name="alias"
                                maxLength={120}
                                placeholder={t("aliasPlaceholder")}
                                required
                              />
                            </Text>
                            <SubmitButton variant="soft">
                              {t("addAlias")}
                            </SubmitButton>
                          </form>
                        </Collapsible.Content>
                      </Collapsible.Root>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </Card>
        <aside className="stack">
          <Card asChild>
            <form
              id="new-exercise"
              action={createExerciseAction}
              className="form-grid"
            >
              <Heading as="h2" size="4">
                {t("createExercise")}
              </Heading>
              <Text as="label" size="2" className="field-label">
                {t("defaultName")}
                <TextField.Root
                  name="defaultName"
                  maxLength={120}
                  placeholder={t("exerciseNamePlaceholder")}
                  required
                />
              </Text>
              <SubmitButton>{t("createExercise")}</SubmitButton>
            </form>
          </Card>
          {recent.length ? (
            <Card asChild>
              <section className="stack">
                <Heading as="h2" size="4">
                  {t("recentExercises")}
                </Heading>
                {recent.map(([id, item]) => (
                  <NextLink
                    className="recent-exercise title-link"
                    href={`/exercises/${id}`}
                    key={id}
                  >
                    <Text weight="medium">{item.name}</Text>
                    <Text size="1" color="gray">
                      {formatDateKey(item.date)}
                    </Text>
                  </NextLink>
                ))}
              </section>
            </Card>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
