import { formatDateKey } from "@narumitw/fitness-core/calendar";
import type { z } from "zod";

export function validateDto<S extends z.ZodType>(
  schema: S,
  value: unknown,
): z.output<S> {
  const parsed = schema.safeParse(toDto(value));
  if (!parsed.success) throw new Error("Invalid response DTO");
  return parsed.data as z.output<S>;
}
// Convert database values before applying the endpoint's allow-list schema.
// Never stringify arbitrary BigInt, binary, or unsupported values.
export function toDto(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(toDto);
  if (typeof value !== "object" || value instanceof Uint8Array)
    throw new Error("Unsupported DTO value");
  const record = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  const excluded = new Set([
    "passwordHash",
    "tokenHash",
    "publicKey",
    "counter",
    "fingerprint",
    "startKey",
    "importBatchId",
  ]);
  for (const [key, item] of Object.entries(record)) {
    if (excluded.has(key) || item === undefined) continue;
    result[key] =
      item instanceof Date &&
      ["date", "plannedDate", "effectiveFrom", "effectiveTo"].includes(key)
        ? formatDateKey(item)
        : toDto(item);
  }
  return result;
}
