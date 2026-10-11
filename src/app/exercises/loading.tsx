import { Text } from "@radix-ui/themes";
import { getDictionary } from "@/lib/i18n";
export default async function Loading() {
  const t = await getDictionary();
  return (
    <Text as="p" role="status" aria-busy="true">
      {t("loading")}
    </Text>
  );
}
