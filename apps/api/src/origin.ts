// An Origin is a canonical scheme/host/port tuple, not a page URL.
export function validateProductionOrigin(
  value = process.env.PASSKEY_ORIGIN,
): string {
  try {
    if (!value) throw new Error("Missing origin");
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      value !== url.origin ||
      url.username ||
      url.password
    )
      throw new Error("Invalid origin");
    return value;
  } catch {
    throw new Error("PASSKEY_ORIGIN must be an exact HTTPS origin");
  }
}
