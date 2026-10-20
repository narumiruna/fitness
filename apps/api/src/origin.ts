// Strip trailing slashes from configuration, but still reject page URLs.
export function validateProductionOrigin(
  value = process.env.PASSKEY_ORIGIN,
): string {
  try {
    if (!value) throw new Error("Missing origin");
    const origin = value.replace(/\/+$/, "");
    const url = new URL(origin);
    if (
      url.protocol !== "https:" ||
      origin !== url.origin ||
      url.username ||
      url.password
    )
      throw new Error("Invalid origin");
    return origin;
  } catch {
    throw new Error("PASSKEY_ORIGIN must be an exact HTTPS origin");
  }
}
