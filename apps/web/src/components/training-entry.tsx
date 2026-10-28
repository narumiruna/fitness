import { Badge, Button, Card, Heading, Select, Text } from "@radix-ui/themes";
import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import type { PageView } from "@/api/views";
import { useDictionary, useLocale } from "@/lib/i18n";
import { StartSessionForm } from "./session-panel";

export function TrainingEntry({
  sessions,
  templates,
  today,
}: {
  sessions: PageView<"workouts">["ongoingSessions"];
  templates: PageView<"workouts">["templates"];
  today: string;
}) {
  const t = useDictionary();
  const locale = useLocale();
  const [selectedId, setSelectedId] = useState("");
  const [openedIds, setOpenedIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  if (!sessions.length && !templates.length) return null;
  const sessionCard = (session: (typeof sessions)[number], primary = false) => (
    <article className="ongoing-session" key={session.id}>
      <div className="stack">
        <div className="meta-row">
          <Text weight="bold" className="ongoing-title">
            {session.title || t("workout")}
          </Text>
          <Badge color={session.state === "ACTIVE" ? "teal" : "gray"}>
            {t(session.state)}
          </Badge>
        </div>
        <Text size="1" color="gray">
          {session.date.toLocaleDateString(locale)}
          {" · "}
          {t("sessionProgress")
            .replace("{completed}", number(session.completedSets))
            .replace("{total}", number(session.totalSets))}
        </Text>
      </div>
      <Button highContrast variant={primary ? "solid" : "soft"} asChild>
        <RouterLink to={`/workouts/${session.id}`}>
          {t("continueTraining")}
        </RouterLink>
      </Button>
    </article>
  );
  return (
    <Card asChild>
      <section
        className="training-entry stack"
        aria-labelledby="training-entry-heading"
      >
        <Heading as="h2" size="4" id="training-entry-heading">
          {t("trainingEntryTitle")}
        </Heading>
        <div
          className={`training-entry-content${sessions.length ? " has-sessions" : ""}`}
        >
          {sessions.length ? (
            <div className="ongoing-sessions">
              {sessions
                .slice(0, 1)
                .map((session) => sessionCard(session, true))}
              {sessions.length > 1 ? (
                <details>
                  <summary>
                    {t("otherOngoingSessions").replace(
                      "{count}",
                      number(sessions.length - 1),
                    )}
                  </summary>
                  <div className="ongoing-sessions">
                    {sessions.slice(1).map((session) => sessionCard(session))}
                  </div>
                </details>
              ) : null}
            </div>
          ) : null}
          {templates.length ? (
            <div className="template-launch stack">
              <Text as="label" size="2" className="field-label">
                {t("startFromTemplate")}
                <Select.Root
                  value={selectedId}
                  onValueChange={(id) => {
                    setSelectedId(id);
                    setOpenedIds((ids) =>
                      ids.includes(id) ? ids : [...ids, id],
                    );
                  }}
                  disabled={pending}
                >
                  <Select.Trigger
                    aria-label={t("startFromTemplate")}
                    placeholder={t("chooseTemplate")}
                  />
                  <Select.Content position="popper">
                    {templates.map((template) => (
                      <Select.Item key={template.id} value={template.id}>
                        {template.title}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              </Text>
              {/* Keep visited forms mounted to preserve drafts and retry keys. */}
              {templates
                .filter((template) => openedIds.includes(template.id))
                .map((template) => (
                  <div
                    className="selected-template stack"
                    key={template.id}
                    hidden={template.id !== selectedId}
                  >
                    <Text size="1" color="gray">
                      {t(
                        template._count?.sets === 1
                          ? "prescribedSet"
                          : "prescribedSets",
                      ).replace("{count}", number(template._count?.sets ?? 0))}
                    </Text>
                    <StartSessionForm
                      source="template"
                      sourceId={template.id}
                      date={today}
                      onPendingChange={setPending}
                    />
                  </div>
                ))}
            </div>
          ) : null}
        </div>
      </section>
    </Card>
  );
}
