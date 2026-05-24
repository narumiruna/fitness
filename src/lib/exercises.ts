export function normalizeExerciseAlias(value: string) {
  return value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

export function slugifyExerciseName(value: string) {
  return normalizeExerciseAlias(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
