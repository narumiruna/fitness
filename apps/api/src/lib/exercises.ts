export function normalizeExerciseAlias(value: string) {
  return value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

export function exerciseHasName(
  exercise: { defaultName: string; names: { name: string }[] },
  normalizedName: string,
) {
  return [
    exercise.defaultName,
    ...exercise.names.map((name) => name.name),
  ].some((name) => normalizeExerciseAlias(name) === normalizedName);
}

// Seed and legacy import use this value as a stable lookup key.
export function slugifyExerciseName(value: string) {
  return normalizeExerciseAlias(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
