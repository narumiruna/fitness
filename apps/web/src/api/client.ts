import { type ApiError, apiErrorSchema } from "@narumitw/fitness-contracts";
import { QueryClient } from "@tanstack/react-query";
import type { z } from "zod";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code:
      | ApiError["error"]["code"]
      | "NETWORK_ERROR"
      | "INVALID_RESPONSE",
  ) {
    super(code);
  }
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: 0, refetchOnWindowFocus: true },
    mutations: { retry: false },
  },
});

let accountGeneration = 0;
const requests = new Set<AbortController>();
export function clearPrivateState() {
  accountGeneration++;
  for (const request of requests) request.abort();
  queryClient.clear();
  window.dispatchEvent(new Event("fitness:clear-drafts"));
}

export async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
  const generation = accountGeneration;
  const controller = new AbortController();
  requests.add(controller);
  const abort = () => controller.abort();
  init.signal?.addEventListener("abort", abort, { once: true });
  if (init.signal?.aborted) controller.abort();
  try {
    const response = await fetch(path, {
      ...init,
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    });
    if (generation !== accountGeneration)
      throw new DOMException("Account changed", "AbortError");
    const json: unknown = await response.json().catch(() => null);
    if (generation !== accountGeneration)
      throw new DOMException("Account changed", "AbortError");
    if (!response.ok) {
      const error = apiErrorSchema.safeParse(json);
      if (response.status === 401) {
        clearPrivateState();
        window.dispatchEvent(new Event("fitness:expired"));
      }
      throw new HttpError(
        response.status,
        error.success ? error.data.error.code : "INVALID_RESPONSE",
      );
    }
    const result = schema.safeParse(json);
    if (!result.success)
      throw new HttpError(response.status, "INVALID_RESPONSE");
    return result.data;
  } catch (error) {
    if (
      error instanceof HttpError ||
      (error instanceof DOMException && error.name === "AbortError")
    )
      throw error;
    throw new HttpError(0, "NETWORK_ERROR");
  } finally {
    requests.delete(controller);
    init.signal?.removeEventListener("abort", abort);
  }
}

export async function refreshViews() {
  await queryClient.invalidateQueries({ queryKey: ["view"] });
}
