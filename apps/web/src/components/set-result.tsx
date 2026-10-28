import { Badge, Text } from "@radix-ui/themes";
import type { PageView } from "@/api/views";
import { type MessageKey, useDictionary, useLocale } from "@/lib/i18n";
import { formatRecordedNumber } from "@/lib/recorded-values";

export function SetResult({
  set,
}: {
  set: Pick<
    PageView<"workout">["workout"]["sets"][number],
    "weight" | "reps" | "type" | "rir" | "notes"
  >;
}) {
  const t = useDictionary();
  const locale = useLocale();
  return (
    <div className="set-result">
      <Text as="p" weight="medium">
        {t("recordedSetActuals")
          .replace("{weight}", formatRecordedNumber(set.weight, locale))
          .replace("{reps}", formatRecordedNumber(set.reps, locale))}
      </Text>
      <div className="set-result-meta">
        <Badge color="gray" variant="soft">
          {t(set.type as MessageKey)}
        </Badge>
        {set.rir != null ? (
          <Text size="2" color="gray">
            {t("rir")}: {formatRecordedNumber(set.rir, locale)}
          </Text>
        ) : null}
      </div>
      {set.notes ? (
        <Text as="p" size="2" className="set-result-notes">
          {set.notes}
        </Text>
      ) : null}
    </div>
  );
}
