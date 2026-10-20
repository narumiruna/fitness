import { formatDateKey } from "@narumitw/fitness-core/calendar";
import { equipment, muscles } from "@narumitw/fitness-core/training";
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
import { Collapsible } from "radix-ui";
import { Link as RouterLink } from "react-router-dom";
import { createExerciseAction, createExerciseAliasAction } from "@/api/actions";
import { usePageView, useSearch } from "@/api/views";
import { ActionForm } from "@/components/action-form";
import {
  EmptyState,
  MetricCard,
  PageHeader,
  StrengthIcon,
} from "@/components/dashboard";
import { FormSelect } from "@/components/form-select";
import { SubmitButton } from "@/components/submit-button";
import type { MessageKey } from "@/lib/i18n";
import { useDictionary, useLocale } from "@/lib/i18n";
import { useSession } from "@/lib/session";

export default function ExercisesPage() {
  const { user } = useSession();
  const {
    exercises,
    totalExerciseCount,
    totalAliasCount,
    usedExercises,
    muscleGroups,
  } = usePageView("exercises");
  const t = useDictionary();
  const locale = useLocale();
  const params = useSearch();
  const query = params.q?.trim() ?? "";
  const createdExerciseId = params.created?.trim() ?? "";
  const sort =
    params.sort === "desc" || params.sort === "recent" ? params.sort : "asc";
  const usage = new Map(
    usedExercises.map((item) => [
      item.exerciseId,
      { name: item.name, date: new Date(item.date), count: Number(item.count) },
    ]),
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
            icon="library"
            label={t("totalExercises")}
            value={String(totalExerciseCount)}
          />
          <MetricCard
            icon="activity"
            label={t("usedExercises")}
            value={String(usage.size)}
          />
          <MetricCard
            icon="sets"
            label={t("aliases")}
            value={String(totalAliasCount)}
          />
          <MetricCard
            icon="calendar"
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
            <ActionForm
              action="/exercises"
              className="library-metadata-filters"
            >
              <input type="hidden" name="q" value={query} />
              <FormSelect
                name="muscle"
                label={t("muscle")}
                defaultValue={params.muscle ?? "all"}
                options={[
                  { value: "all", label: t("allExercises") },
                  ...muscles.map((m) => ({
                    value: m,
                    label: t(m as MessageKey),
                  })),
                ]}
              />
              <FormSelect
                name="equipment"
                label={t("equipment")}
                defaultValue={params.equipment ?? "all"}
                options={[
                  { value: "all", label: t("allExercises") },
                  ...equipment.map((m) => ({
                    value: m,
                    label: t(m as MessageKey),
                  })),
                ]}
              />
              <Button highContrast type="submit">
                {t("applyFilters")}
              </Button>
              <Button highContrast asChild variant="soft">
                <RouterLink to="/exercises">{t("clearFilters")}</RouterLink>
              </Button>
            </ActionForm>
            {totalExerciseCount > 0 ? (
              <ActionForm
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
                      <RouterLink to="/exercises">
                        {t("clearSearch")}
                      </RouterLink>
                    </Button>
                  ) : null}
                </div>
              </ActionForm>
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
                    <span className="row-icon">
                      <StrengthIcon />
                    </span>
                    <div className="exercise-row-main">
                      <Heading as="h3" size="3">
                        <RouterLink
                          className="title-link"
                          to={`/exercises/${exercise.id}`}
                        >
                          {exercise.defaultName}
                        </RouterLink>
                      </Heading>
                      <Text as="p" size="1" color="gray">
                        {[
                          ...(exercise.muscles ?? [])
                            .filter((m) => m.role === "PRIMARY")
                            .map((m) => t(m.muscle as MessageKey)),
                          ...(exercise.equipment ?? []).map((e) =>
                            t(e.equipment as MessageKey),
                          ),
                        ].join(" · ")}
                      </Text>
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
                      {(exercise.aliases ?? []).length
                        ? (exercise.aliases ?? []).map((alias) => (
                            <Badge color="gray" variant="soft" key={alias.id}>
                              {alias.alias}
                              <Text size="1" color="gray">
                                {alias.locale}
                              </Text>
                            </Badge>
                          ))
                        : null}
                    </div>
                    <div className="exercise-actions">
                      {user?.role === "ADMIN" ||
                      exercise.createdByUserId === user?.id ? (
                        <Button highContrast asChild size="1" variant="soft">
                          <RouterLink
                            to={`/exercises/${exercise.id}#edit-exercise`}
                          >
                            {t("editExercise")}
                          </RouterLink>
                        </Button>
                      ) : null}
                      <Button highContrast asChild size="1" variant="soft">
                        <RouterLink to={`/exercises/${exercise.id}`}>
                          {t("history")}
                        </RouterLink>
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
                          <ActionForm
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
                          </ActionForm>
                        </Collapsible.Content>
                      </Collapsible.Root>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </Card>
        <aside className="stack exercise-sidebar">
          {muscleGroups.length ? (
            <Card asChild>
              <section className="stack">
                <Heading as="h2" size="4">
                  {t("muscleGroups")}
                </Heading>
                {muscleGroups.map((group) => (
                  <RouterLink
                    className="muscle-group-row title-link"
                    key={group.muscle}
                    to={`/exercises?muscle=${group.muscle}`}
                  >
                    <span className="row-icon">
                      <StrengthIcon />
                    </span>
                    <div>
                      <Text as="p" size="2" weight="medium">
                        {t(group.muscle as MessageKey)}
                      </Text>
                      <Text as="p" size="1" color="gray">
                        {t(
                          group._count === 1
                            ? "exerciseCountOne"
                            : "exerciseCountOther",
                        ).replace(
                          "{count}",
                          new Intl.NumberFormat(locale).format(group._count),
                        )}
                      </Text>
                    </div>
                    <span aria-hidden="true">›</span>
                  </RouterLink>
                ))}
              </section>
            </Card>
          ) : null}
          <Card asChild>
            <ActionForm
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
            </ActionForm>
          </Card>
          {recent.length ? (
            <Card asChild>
              <section className="stack">
                <Heading as="h2" size="4">
                  {t("recentExercises")}
                </Heading>
                {recent.map(([id, item]) => (
                  <RouterLink
                    className="recent-exercise title-link"
                    to={`/exercises/${id}`}
                    key={id}
                  >
                    <Text weight="medium">{item.name}</Text>
                    <Text size="1" color="gray">
                      {formatDateKey(item.date)}
                    </Text>
                  </RouterLink>
                ))}
              </section>
            </Card>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
