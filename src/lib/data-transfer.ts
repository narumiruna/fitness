import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { formatDateKey, parseDateKey } from "./calendar";
import { normalizeExerciseAlias, slugifyExerciseName } from "./exercises";
import { prisma } from "./prisma";
import {
  occurrenceFingerprint,
  parseWorkouts,
  type TransferWorkout,
} from "./workout-csv";

export async function exportWorkouts(
  userId: string,
): Promise<TransferWorkout[]> {
  const rows = await prisma.workout.findMany({
    where: { userId },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    include: {
      sets: {
        include: { exercise: true },
        orderBy: [{ order: "asc" }, { id: "asc" }],
      },
    },
  });
  return rows.map((w) => ({
    key: w.id,
    date: formatDateKey(w.date),
    title: w.title,
    notes: w.notes,
    state: w.state,
    activeSeconds: w.activeSeconds,
    templateTitle: w.templateTitle,
    sets: w.sets.map((s) => ({
      order: s.order,
      exercise: s.exercise.defaultName,
      weight: s.weight,
      reps: s.reps,
      notes: s.notes,
      type: s.type as "WORKING" | "WARMUP",
      rir: s.rir,
      completed: s.completed,
      targetWeight: s.targetWeight,
      targetReps: s.targetReps,
    })),
  }));
}
export async function previewImport(userId: string, text: string) {
  const parsed = parseWorkouts(text);
  const exercises = await prisma.exercise.findMany({
    include: { aliases: true, names: true },
  });
  const matches = new Map<string, string>();
  for (const e of exercises)
    for (const name of [
      e.defaultName,
      ...e.aliases.map((a) => a.alias),
      ...e.names.map((n) => n.name),
    ]) {
      const key = normalizeExerciseAlias(name);
      // Ambiguous names require explicit mapping.
      matches.set(
        key,
        matches.has(key) && matches.get(key) !== e.id ? "" : e.id,
      );
    }
  const unknown = [
    ...new Set(parsed.workouts.flatMap((w) => w.sets.map((s) => s.exercise))),
  ].filter((name) => !matches.get(normalizeExerciseAlias(name)));
  const existingCounts = new Map<string, number>();
  const incomingCounts = new Map<string, number>();
  const existing = new Set(
    (await exportWorkouts(userId)).map((w) =>
      occurrenceFingerprint(w, existingCounts),
    ),
  );
  const duplicates = parsed.workouts.filter((w) =>
    existing.has(occurrenceFingerprint(w, incomingCounts)),
  ).length;
  return {
    ...parsed,
    unknown,
    duplicates,
    exercises: exercises.map((e) => ({ id: e.id, name: e.defaultName })),
    matches: Object.fromEntries(matches),
  };
}
export async function confirmImport(
  userId: string,
  text: string,
  mappings: Record<string, string>,
) {
  const parsed = parseWorkouts(text);
  if (parsed.errors.length) throw new Error("Invalid CSV rows.");
  const digest = createHash("sha256")
    .update(text)
    .update(JSON.stringify(Object.entries(mappings).sort()))
    .digest("hex");
  return prisma.$transaction(
    async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { updatedAt: new Date() },
      });
      const prior = await tx.importBatch.findUnique({
        where: { userId_digest: { userId, digest } },
      });
      if (prior) return { imported: 0, skipped: parsed.workouts.length };
      const exercises = await tx.exercise.findMany({
        include: { aliases: true, names: true },
      });
      const matches = new Map<string, string>();
      for (const e of exercises)
        for (const name of [
          e.defaultName,
          ...e.aliases.map((a) => a.alias),
          ...e.names.map((n) => n.name),
        ]) {
          const key = normalizeExerciseAlias(name);
          matches.set(
            key,
            matches.has(key) && matches.get(key) !== e.id ? "" : e.id,
          );
        }
      const existing = await tx.workout.findMany({
        where: { userId },
        include: {
          sets: {
            include: { exercise: true },
            orderBy: [{ order: "asc" }, { id: "asc" }],
          },
        },
      });
      const fingerprints = new Set<string>();
      const existingCounts = new Map<string, number>();
      const incomingCounts = new Map<string, number>();
      for (const w of existing) {
        if (w.fingerprint) fingerprints.add(w.fingerprint);
        fingerprints.add(
          occurrenceFingerprint(
            {
              key: w.id,
              date: formatDateKey(w.date),
              title: w.title,
              notes: w.notes,
              state: w.state,
              activeSeconds: w.activeSeconds,
              templateTitle: w.templateTitle,
              sets: w.sets.map((s) => ({
                order: s.order,
                exercise: s.exercise.defaultName,
                weight: s.weight,
                reps: s.reps,
                notes: s.notes,
                type: s.type as "WORKING" | "WARMUP",
                rir: s.rir,
                completed: s.completed,
                targetWeight: s.targetWeight,
                targetReps: s.targetReps,
              })),
            },
            existingCounts,
          ),
        );
      }
      const batch = await tx.importBatch.create({ data: { userId, digest } });
      let imported = 0;
      let skipped = 0;
      const created = new Map<string, string>();
      for (const w of parsed.workouts) {
        const sets = [];
        for (const s of w.sets) {
          const name = normalizeExerciseAlias(s.exercise);
          let id =
            created.get(name) ??
            (Object.hasOwn(mappings, s.exercise)
              ? mappings[s.exercise]
              : undefined) ??
            matches.get(name);
          const known = matches.get(name);
          if (id === "create" && known) id = known;
          if (id === "create") {
            const e = await tx.exercise.create({
              data: {
                defaultName: s.exercise,
                slug: `${slugifyExerciseName(s.exercise) || "exercise"}-${randomUUID()}`,
                createdByUserId: userId,
              },
            });
            exercises.push({ ...e, aliases: [], names: [] });
            matches.set(name, e.id);
            created.set(name, e.id);
            id = e.id;
          }
          if (!id || !exercises.some((e) => e.id === id))
            throw new Error("Explicit exercise mapping required.");
          const exercise = exercises.find((e) => e.id === id);
          sets.push({
            ...s,
            exercise: exercise?.defaultName ?? s.exercise,
            exerciseId: id,
          });
        }
        const canonical = {
          ...w,
          sets: sets.map(({ exerciseId: _, ...s }) => s),
        };
        const fingerprint = occurrenceFingerprint(canonical, incomingCounts);
        if (fingerprints.has(fingerprint)) {
          skipped++;
          continue;
        }
        await tx.workout.create({
          data: {
            userId,
            date: parseDateKey(w.date) as Date,
            title: w.title,
            notes: w.notes,
            state: w.state,
            activeSeconds: w.activeSeconds,
            templateTitle: w.templateTitle,
            importBatchId: batch.id,
            fingerprint,
            sets: { create: sets.map(({ exercise: _, ...s }) => s) },
          },
        });
        fingerprints.add(fingerprint);
        imported++;
      }
      return { imported, skipped };
    },
    { timeout: 60000 },
  );
}
