"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { confirmImport, previewImport } from "@/lib/data-transfer";
import { importMappingsSchema } from "@/lib/validation";
import { csvLimit } from "@/lib/workout-csv";

async function uploadText(data: FormData) {
  const file = data.get("file");
  if (!(file instanceof File) || file.size > csvLimit)
    throw new Error("Invalid upload.");
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
  const mappings = importMappingsSchema.parse(
    JSON.parse(String(data.get("mappings") ?? "{}")),
  );
  const result = await confirmImport(user.id, await uploadText(data), mappings);
  revalidatePath("/", "layout");
  return result;
}
