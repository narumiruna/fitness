import { Button, Card, Heading, Text } from "@radix-ui/themes";
import { DataImport } from "@/components/data-import";
import { useDictionary } from "@/lib/i18n";
export default function DataPage() {
  const t = useDictionary();
  const keys = [
    "file",
    "csvError",
    "csvRowError",
    "preview",
    "saveFailed",
    "imported",
    "skipped",
    "rows",
    "workouts",
    "mapping",
    "createUnknown",
    "confirmImport",
    "cancel",
    "importSelectStep",
    "importReviewStep",
  ] as const;
  return (
    <section className="stack">
      <Heading as="h1" size="8">
        {t("dataTransfer")}
      </Heading>
      <Card className="stack">
        <Heading as="h2" size="5">
          {t("exportCsv")}
        </Heading>
        <div>
          <Button highContrast asChild variant="soft">
            <a href="/data/export">{t("exportCsv")}</a>
          </Button>
        </div>
      </Card>
      <Heading as="h2" size="5">
        {t("importCsv")}
      </Heading>
      <details>
        <summary>{t("importFormatHelp")}</summary>
        <Text as="p" size="2">
          {t("importHelp")}
        </Text>
      </details>
      <DataImport labels={Object.fromEntries(keys.map((k) => [k, t(k)]))} />
    </section>
  );
}
