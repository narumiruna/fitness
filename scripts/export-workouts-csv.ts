import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { logger } from "../apps/api/src/lib/logger";
import {
  parseWorkoutLine,
  stringifyWorkoutCsv,
  type WorkoutCsvRow,
} from "./workout-csv";

const workoutsDirectory = path.join(process.cwd(), "data", "workouts");
const outputPath = path.join(process.cwd(), "data", "workouts.csv");

async function main() {
  logger.info(
    { event: "workouts.export_started" },
    "Workout CSV export started",
  );
  const files = (await readdir(workoutsDirectory))
    .filter((file) => file.endsWith(".md"))
    .sort((a, b) => a.localeCompare(b));
  const rows: WorkoutCsvRow[] = [];
  const nextOrderByDate = new Map<string, number>();
  let setCount = 0;
  let noteCount = 0;

  for (const file of files) {
    const sourceFile = path.join("data", "workouts", file);
    const content = await readFile(path.join(workoutsDirectory, file), "utf8");
    const { bodyLines, date } = parseWorkoutMarkdown(content, file);
    let nextOrder = nextOrderByDate.get(date) ?? 1;

    for (const line of bodyLines) {
      const parsedLine = parseWorkoutLine(line);

      if (parsedLine.type === "note") {
        rows.push({
          date,
          sourceFile,
          rowType: "note",
          exerciseNameZh: "",
          exerciseNameEn: "",
          order: "",
          weight: "",
          reps: "",
          note: parsedLine.note,
          rawLine: line,
        });
        noteCount += 1;
        continue;
      }

      for (const set of parsedLine.sets) {
        rows.push({
          date,
          sourceFile,
          rowType: "set",
          exerciseNameZh: parsedLine.exerciseNameZh,
          exerciseNameEn: parsedLine.exerciseNameEn,
          order: nextOrder,
          weight: set.weight,
          reps: set.reps,
          note: "",
          rawLine: line,
        });
        nextOrder += 1;
        setCount += 1;
      }
    }

    nextOrderByDate.set(date, nextOrder);
  }

  await writeFile(outputPath, `${stringifyWorkoutCsv(rows)}\n`, "utf8");
  logger.info(
    {
      event: "workouts.export_completed",
      rowCount: rows.length,
      setCount,
      noteCount,
    },
    "Workout CSV export completed",
  );
}

function parseWorkoutMarkdown(content: string, file: string) {
  const lines = content.split(/\r?\n/);
  const bodyLines: string[] = [];
  let date = file.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  let index = 0;

  if (lines[0]?.trim() === "---") {
    index = 1;

    while (index < lines.length && lines[index]?.trim() !== "---") {
      const dateMatch = lines[index]?.match(/^date:\s*"?(\d{4}-\d{2}-\d{2})"?/);

      if (dateMatch) {
        date = dateMatch[1];
      }

      index += 1;
    }

    if (lines[index]?.trim() === "---") {
      index += 1;
    }
  }

  if (!date) {
    throw new Error(`Missing workout date in ${file}`);
  }

  for (; index < lines.length; index += 1) {
    const line = lines[index]?.trim();

    if (!line || line.startsWith("![[")) {
      continue;
    }

    const normalizedLine = line.replace(/^[-*]\s+/, "").trim();

    if (!normalizedLine || /^-+$/.test(normalizedLine)) {
      continue;
    }

    bodyLines.push(normalizedLine);
  }

  return { bodyLines, date };
}

main().catch((error) => {
  logger.error(
    { event: "workouts.export_failed", err: error },
    "Workout CSV export failed",
  );
  process.exit(1);
});
