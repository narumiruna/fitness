import { Flex, Heading, Link, Text } from "@radix-ui/themes";
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
      <Flex gap="4" wrap="wrap">
        <Link highContrast href="https://github.com/narumiruna/fitness">
          {t("sourceRepository")}
        </Link>
        <Link
          highContrast
          href="https://github.com/narumiruna/fitness/blob/main/LICENSE"
        >
          {t("sourceLicenseLink")}
        </Link>
      </Flex>
    </section>
  );
}
