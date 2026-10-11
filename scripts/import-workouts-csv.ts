import "dotenv/config";

import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  normalizeExerciseAlias,
  slugifyExerciseName,
} from "../src/lib/exercises";
import { logger } from "../src/lib/logger";
import { prisma } from "../src/lib/prisma";
import { parseWorkoutCsv, type WorkoutCsvRow } from "./workout-csv";

const inputPath = path.join(process.cwd(), "data", "workouts.csv");

async function main() {
  logger.info(
    { event: "workouts.import_started" },
    "Workout CSV import started",
  );
  const user = await prisma.user.findFirst({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, username: true },
  });

  if (!user) {
    throw new Error("No users found. Run npm run db:seed first.");
  }

  const rows = parseWorkoutCsv(await readFile(inputPath, "utf8"));
  const groupedRows = groupRowsByDate(rows);
  const exerciseIds = await ensureExercises(rows.filter(isSetRow));
  let workoutCount = 0;
  let setCount = 0;

  for (const [date, dateRows] of groupedRows) {
    const workoutDate = new Date(`${date}T00:00:00`);
    const nextWorkoutDate = new Date(workoutDate);
    nextWorkoutDate.setDate(nextWorkoutDate.getDate() + 1);
    const notes = dateRows
      .filter((row) => row.rowType === "note")
      .map((row) => row.note)
      .join("\n");
    const setRows = dateRows.filter(isSetRow);

    await prisma.$transaction(async (tx) => {
      await tx.workout.deleteMany({
        where: {
          userId: user.id,
          date: {
            gte: workoutDate,
            lt: nextWorkoutDate,
          },
        },
      });

      await tx.workout.create({
        data: {
          userId: user.id,
          date: workoutDate,
          notes: notes || null,
          sets: {
            create: setRows.map((row) => ({
              exerciseId: getExerciseId(exerciseIds, row.exerciseNameEn),
              order: row.order,
              weight: row.weight,
              reps: row.reps,
            })),
          },
        },
      });
    });

    workoutCount += 1;
    setCount += setRows.length;
  }

  logger.info(
    {
      event: "workouts.import_completed",
      workoutCount,
      setCount,
      userId: user.id,
    },
    "Workout CSV import completed",
  );
}

function groupRowsByDate(rows: WorkoutCsvRow[]) {
  const groupedRows = new Map<string, WorkoutCsvRow[]>();

  for (const row of rows) {
    const dateRows = groupedRows.get(row.date) ?? [];
    dateRows.push(row);
    groupedRows.set(row.date, dateRows);
  }

  return groupedRows;
}

async function ensureExercises(rows: SetWorkoutCsvRow[]) {
  const exerciseNames = new Map<
    string,
    { exerciseNameEn: string; zhAliases: Set<string> }
  >();

  for (const row of rows) {
    const existing = exerciseNames.get(row.exerciseNameEn) ?? {
      exerciseNameEn: row.exerciseNameEn,
      zhAliases: new Set<string>(),
    };
    existing.zhAliases.add(row.exerciseNameZh);
    exerciseNames.set(row.exerciseNameEn, existing);
  }

  const exerciseIds = new Map<string, string>();

  for (const exercise of exerciseNames.values()) {
    const record = await prisma.exercise.upsert({
      where: { slug: slugifyExerciseName(exercise.exerciseNameEn) },
      update: { defaultName: exercise.exerciseNameEn },
      create: {
        slug: slugifyExerciseName(exercise.exerciseNameEn),
        defaultName: exercise.exerciseNameEn,
      },
    });

    await prisma.exerciseName.upsert({
      where: {
        exerciseId_locale_name: {
          exerciseId: record.id,
          locale: "en",
          name: exercise.exerciseNameEn,
        },
      },
      update: { isPrimary: true },
      create: {
        exerciseId: record.id,
        locale: "en",
        name: exercise.exerciseNameEn,
        isPrimary: true,
      },
    });

    await upsertExerciseAlias(record.id, "en", exercise.exerciseNameEn);

    for (const zhAlias of exercise.zhAliases) {
      await prisma.exerciseName.upsert({
        where: {
          exerciseId_locale_name: {
            exerciseId: record.id,
            locale: "zh-TW",
            name: zhAlias,
          },
        },
        update: {},
        create: {
          exerciseId: record.id,
          locale: "zh-TW",
          name: zhAlias,
          isPrimary: false,
        },
      });
      await upsertExerciseAlias(record.id, "zh-TW", zhAlias);
    }

    exerciseIds.set(exercise.exerciseNameEn, record.id);
  }

  return exerciseIds;
}

async function upsertExerciseAlias(
  exerciseId: string,
  locale: string,
  alias: string,
) {
  await prisma.exerciseAlias.upsert({
    where: {
      locale_normalizedAlias: {
        locale,
        normalizedAlias: normalizeExerciseAlias(alias),
      },
    },
    update: {
      alias,
      exerciseId,
    },
    create: {
      locale,
      alias,
      normalizedAlias: normalizeExerciseAlias(alias),
      exerciseId,
    },
  });
}

function getExerciseId(
  exerciseIds: Map<string, string>,
  exerciseNameEn: string,
) {
  const exerciseId = exerciseIds.get(exerciseNameEn);

  if (!exerciseId) {
    throw new Error(`Missing exercise id for ${exerciseNameEn}`);
  }

  return exerciseId;
}

function isSetRow(row: WorkoutCsvRow): row is SetWorkoutCsvRow {
  return row.rowType === "set";
}

type SetWorkoutCsvRow = Extract<WorkoutCsvRow, { rowType: "set" }>;

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    logger.error(
      { event: "workouts.import_failed", err: error },
      "Workout CSV import failed",
    );
    await prisma.$disconnect();
    process.exit(1);
  });
