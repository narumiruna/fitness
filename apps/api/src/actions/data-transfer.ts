import { ApiError } from "../errors.js";
import { requireUser } from "../lib/auth.js";
import { confirmImport, previewImport } from "../lib/data-transfer.js";
import { importMappingsSchema } from "../lib/validation.js";
import { csvLimit } from "../lib/workout-csv.js";

async function uploadText(data: FormData) {
  const file = data.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "VALIDATION_ERROR");
  if (file.size > csvLimit) throw new ApiError(413, "BODY_TOO_LARGE");
  return file.text();
}
export async function previewImportAction(data: FormData) {
  const user = await requireUser();
  const p = await previewImport(user.id, await uploadText(data));
  return {
    rows: p.rows,
    workouts: p.workouts.length,
    errors: p.errors,
    unknown: p.unknown,
    duplicates: p.duplicates,
    exercises: p.exercises,
  };
}
export async function confirmImportAction(data: FormData) {
  const user = await requireUser();
  let rawMappings: unknown;
  try {
    rawMappings = JSON.parse(String(data.get("mappings") ?? "{}"));
  } catch {
    throw new ApiError(400, "VALIDATION_ERROR");
  }
  const mappings = importMappingsSchema.parse(rawMappings);
  const result = await confirmImport(user.id, await uploadText(data), mappings);

  return result;
}
