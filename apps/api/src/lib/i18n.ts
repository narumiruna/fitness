import { resolveLocale } from "@narumitw/fitness-contracts";
import { cookies, headers } from "../request-context.js";
export async function getLocale() {
  return resolveLocale(
    (await cookies()).get("locale")?.value,
    (await headers()).get("accept-language"),
  );
}
