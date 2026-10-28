export function formatRecordedNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    maximumSignificantDigits: 21,
  }).format(Object.is(value, -0) ? 0 : value);
}
