import {
  type ViewDto,
  type ViewName,
  viewSchemas,
} from "@narumitw/fitness-contracts";
import { parseDateKey } from "@narumitw/fitness-core/calendar";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "react-router-dom";
import { useSession } from "@/lib/session";
import { request } from "./client";

type DateField =
  | "date"
  | "plannedDate"
  | "createdAt"
  | "updatedAt"
  | "startedAt"
  | "resumedAt"
  | "finishedAt"
  | "restDeadline"
  | "effectiveFrom"
  | "effectiveTo"
  | "lastUsedAt";
export type BrowserValue<T> = T extends (infer Item)[]
  ? BrowserValue<Item>[]
  : T extends object
    ? {
        [Key in keyof T]: Key extends "history"
          ? T[Key]
          : Key extends DateField
            ? T[Key] extends string | null
              ? Exclude<T[Key], string> | Date
              : BrowserValue<T[Key]>
            : BrowserValue<T[Key]>;
      }
    : T;
export type PageView<N extends ViewName> = BrowserValue<ViewDto<N>>;

export function calendarDate(value: string): Date {
  const date = parseDateKey(value);
  if (!date) throw new Error("Invalid calendar date");
  return date;
}

// Date-only values are calendar dates. Never interpret them as midnight UTC.
function browserDates(value: unknown, key = ""): unknown {
  if (key === "history") return value;
  if (
    typeof value === "string" &&
    /^(date|plannedDate|effectiveFrom|effectiveTo)$/.test(key) &&
    /^\d{4}-\d{2}-\d{2}$/.test(value)
  )
    return parseDateKey(value);
  if (
    typeof value === "string" &&
    /^(date|createdAt|updatedAt|startedAt|resumedAt|finishedAt|restDeadline|lastUsedAt)$/.test(
      key,
    ) &&
    /^\d{4}-\d{2}-\d{2}T/.test(value)
  )
    return new Date(value);
  if (Array.isArray(value)) return value.map((item) => browserDates(item));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [
        name,
        browserDates(item, name),
      ]),
    );
  return value;
}

export function usePageView<N extends ViewName>(name: N): PageView<N> {
  const { search } = useLocation();
  const { id } = useParams();
  const { user, locale } = useSession();
  const paths: Record<ViewName, string> = {
    workouts: "workouts",
    workout: `workouts/${encodeURIComponent(id ?? "")}`,
    new: "workouts/new",
    exercises: "exercises",
    exercise: `exercises/${encodeURIComponent(id ?? "")}`,
    calendar: "calendar",
    stats: "stats",
    measurements: "measurements",
    users: "users",
    passkeys: "passkeys",
    dashboard: "dashboard",
    data: "data",
  };
  const path = `/api/views/${paths[name]}${search}`;
  const query = useSuspenseQuery({
    queryKey: ["view", user?.id ?? "guest", locale, path],
    queryFn: async ({ signal }) =>
      browserDates(
        await request<unknown>(path, viewSchemas[name], {
          signal,
        }),
      ) as PageView<N>,
  });
  return query.data;
}

export function useSearch(): Record<string, string | undefined> {
  const { search } = useLocation();
  const params: Record<string, string | undefined> = {};
  for (const [key, value] of new URLSearchParams(search)) {
    if (!Object.hasOwn(params, key)) params[key] = value;
  }
  return params;
}
