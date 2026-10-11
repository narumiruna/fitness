import { Button, Heading, Text } from "@radix-ui/themes";
import { DataImport } from "@/components/data-import";
import { requireUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
export default async function DataPage() {
  await requireUser();
  const t = await getDictionary();
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
  ] as const;
  return (
    <section className="stack">
      <Heading as="h1" size="8">
        {t("dataTransfer")}
      </Heading>
      <Text>{t("importHelp")}</Text>
      <Button highContrast asChild>
        <a href="/data/export">{t("exportCsv")}</a>
      </Button>
      <Heading as="h2" size="5">
        {t("importCsv")}
      </Heading>
      <DataImport labels={Object.fromEntries(keys.map((k) => [k, t(k)]))} />
    </section>
  );
}
