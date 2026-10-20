import { AsyncLocalStorage } from "node:async_hooks";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { CookieOptions } from "hono/utils/cookie";

const requests = new AsyncLocalStorage<Context>();
export function withRequest<T>(context: Context, operation: () => T): T {
  return requests.run(context, operation);
}
function currentRequest() {
  const context = requests.getStore();
  if (!context) throw new Error("Request context required");
  return context;
}
export async function headers() {
  return currentRequest().req.raw.headers;
}
export async function cookies() {
  const context = currentRequest();
  return {
    get(name: string) {
      const value = getCookie(context, name);
      return value === undefined ? undefined : { value };
    },
    set(name: string, value: string, options: CookieOptions) {
      setCookie(context, name, value, options);
    },
    delete(name: string) {
      deleteCookie(context, name, {
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: name === "fitness_passkey_challenge" ? "Strict" : "Lax",
      });
    },
  };
}
