import { Heading, Text } from "@radix-ui/themes";
import { useDictionary } from "@/lib/i18n";

export default function SourcePage() {
  const t = useDictionary();

  return (
    <section className="narrow stack">
      <div className="page-header">
        <div>
          <Heading as="h1" size="8">
            {t("sourceLicense")}
          </Heading>
          <Text as="p" size="2" color="gray">
            {t("sourceLicenseBody")}
          </Text>
        </div>
      </div>
    </section>
  );
}
