import {
  Badge,
  Button,
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
import { requireUser } from "@/lib/auth";
import { normalizeExerciseAlias } from "@/lib/exercises";
import { getDictionary } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";

export default async function ExercisesPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; q?: string }>;
}) {
  await requireUser();
  const t = await getDictionary();
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const createdExerciseId = params.created?.trim() ?? "";
  const normalizedQuery = normalizeExerciseAlias(query);

  const [exercises, totalExerciseCount, totalAliasCount, usedExerciseCount] =
    await Promise.all([
      prisma.exercise.findMany({
        where: query
          ? {
              OR: [
                { defaultName: { contains: query } },
                {
                  names: {
                    some: {
                      name: { contains: query },
                    },
                  },
                },
                {
                  aliases: {
                    some: {
                      normalizedAlias: { contains: normalizedQuery },
                    },
                  },
                },
              ],
            }
          : undefined,
        include: {
          _count: {
            select: {
              aliases: true,
              sets: true,
            },
          },
          aliases: {
            orderBy: [{ locale: "asc" }, { alias: "asc" }],
          },
        },
        orderBy: { defaultName: "asc" },
      }),
      prisma.exercise.count(),
      prisma.exerciseAlias.count(),
      prisma.exercise.count({
        where: {
          sets: {
            some: {},
          },
        },
      }),
    ]);

  return (
    <section className="stack exercises-page">
      <div className="page-header">
        <div>
          <Heading as="h1" size="8">
            {t("exercises")}
          </Heading>
          <Text as="p" size="2" color="gray">
            {t("exercisePageIntro")}
          </Text>
        </div>
      </div>

      <section className="stats-card-grid" aria-label={t("overview")}>
        <SummaryCard
          label={t("totalExercises")}
          value={formatInteger(totalExerciseCount)}
        />
        <SummaryCard
          label={t("usedExercises")}
          value={formatInteger(usedExerciseCount)}
        />
        <SummaryCard
          label={t("aliases")}
          value={formatInteger(totalAliasCount)}
        />
        <SummaryCard
          label={query ? t("results") : t("showing")}
          value={formatInteger(exercises.length)}
        />
      </section>

      <div className="exercise-toolbar">
        <Card asChild>
          <div className="stack">
            <div className="section-heading">
              <Heading as="h2" size="5">
                {t("searchExercises")}
              </Heading>
            </div>
            <form className="form-grid" action="/exercises">
              <Text as="label" size="2" weight="medium" className="field-label">
                {t("search")}
                <TextField.Root
                  defaultValue={query}
                  name="q"
                  placeholder={t("exerciseSearchPlaceholder")}
                />
              </Text>
              <div className="toolbar-actions">
                <Button highContrast type="submit">
                  {t("search")}
                </Button>
                {query ? (
                  <Button highContrast asChild variant="soft">
                    <NextLink href="/exercises">{t("clearSearch")}</NextLink>
                  </Button>
                ) : null}
              </div>
            </form>
          </div>
        </Card>

        <Card asChild>
          <form action={createExerciseAction} className="form-grid">
            <div className="section-heading">
              <Heading as="h2" size="5">
                {t("createExercise")}
              </Heading>
            </div>
            <Text as="label" size="2" weight="medium" className="field-label">
              {t("defaultName")}
              <TextField.Root
                name="defaultName"
                placeholder={t("exerciseNamePlaceholder")}
                required
              />
            </Text>
            <Button highContrast type="submit">
              {t("createExercise")}
            </Button>
          </form>
        </Card>
      </div>

      <Card asChild>
        <section className="stack">
          <div className="section-heading">
            <div>
              <Heading as="h2" size="5">
                {query ? t("exerciseResults") : t("exerciseLibrary")}
              </Heading>
              <Text as="p" size="2" color="gray">
                {query ? `${t("search")}: ${query}` : t("exerciseLibraryIntro")}
              </Text>
            </div>
            <Badge color="gray">{exercises.length}</Badge>
          </div>

          {exercises.length === 0 ? (
            <Card asChild>
              <div className="empty-state">
                <Text weight="bold">{t("noExerciseResults")}</Text>
                <Text as="p" size="2" color="gray">
                  {t("noExerciseResultsHint")}
                </Text>
              </div>
            </Card>
          ) : (
            <>
              <div className="exercise-list-header">
                <span>{t("exercise")}</span>
                <span>{t("aliases")}</span>
                <span>{t("actions")}</span>
              </div>
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
                      <div className="exercise-title-row">
                        <div>
                          <Heading as="h3" size="4">
                            {exercise.defaultName}
                          </Heading>
                          <div className="meta-row">
                            <Badge color="gray" variant="soft">
                              {exercise._count.sets}{" "}
                              {exercise._count.sets === 1
                                ? t("set")
                                : t("sets")}
                            </Badge>
                            <Badge color="gray" variant="soft">
                              {exercise._count.aliases} {t("aliases")}
                            </Badge>
                          </div>
                        </div>
                        {exercise.id === createdExerciseId ? (
                          <Badge color="gray" variant="soft">
                            {t("newExercise")}
                          </Badge>
                        ) : null}
                      </div>
                    </div>

                    {exercise.aliases.length > 0 ? (
                      <div className="alias-list">
                        {exercise.aliases.map((alias) => (
                          <Badge color="gray" variant="soft" key={alias.id}>
                            {alias.alias}
                            <Text size="1" color="gray">
                              {alias.locale}
                            </Text>
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <Text as="p" size="2" color="gray">
                        {t("noAliases")}
                      </Text>
                    )}

                    <div className="exercise-actions">
                      <Button highContrast asChild variant="soft">
                        <NextLink href={`/exercises/${exercise.id}`}>
                          {t("history")}
                        </NextLink>
                      </Button>
                      <Collapsible.Root className="inline-disclosure">
                        <Collapsible.Trigger asChild>
                          <Button highContrast variant="ghost" type="button">
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
                            <Text
                              as="label"
                              size="2"
                              weight="medium"
                              className="field-label"
                            >
                              {t("locale")}
                              <TextField.Root
                                defaultValue="zh-TW"
                                name="locale"
                                required
                              />
                            </Text>
                            <Text
                              as="label"
                              size="2"
                              weight="medium"
                              className="field-label"
                            >
                              {t("alias")}
                              <TextField.Root
                                name="alias"
                                placeholder={t("aliasPlaceholder")}
                                required
                              />
                            </Text>
                            <Button highContrast variant="soft" type="submit">
                              {t("addAlias")}
                            </Button>
                          </form>
                        </Collapsible.Content>
                      </Collapsible.Root>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      </Card>
    </section>
  );
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

function formatInteger(value: number) {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 0,
  }).format(value);
}
