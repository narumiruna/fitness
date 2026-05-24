export type WorkoutCsvRow =
  | {
      date: string;
      sourceFile: string;
      rowType: "set";
      exerciseNameZh: string;
      exerciseNameEn: string;
      order: number;
      weight: number;
      reps: number;
      note: "";
      rawLine: string;
    }
  | {
      date: string;
      sourceFile: string;
      rowType: "note";
      exerciseNameZh: "";
      exerciseNameEn: "";
      order: "";
      weight: "";
      reps: "";
      note: string;
      rawLine: string;
    };

export const workoutCsvHeaders = [
  "date",
  "sourceFile",
  "rowType",
  "exerciseNameZh",
  "exerciseNameEn",
  "order",
  "weight",
  "reps",
  "note",
  "rawLine",
] as const;

const exerciseTranslations: Record<string, string> = {
  六角槓硬舉: "Trap Bar Deadlift",
  反手下拉機: "Reverse Grip Lat Pulldown",
  反手前下拉: "Reverse Grip Lat Pulldown",
  坐姿划船: "Seated Row",
  哈克深蹲: "Hack Squat",
  相撲硬舉: "Sumo Deadlift",
  啞鈴二頭彎舉: "Dumbbell Curl",
  啞鈴反向飛鳥: "Dumbbell Reverse Fly",
  啞鈴划船: "Dumbbell Row",
  啞鈴肩推: "Dumbbell Shoulder Press",
  握把式深蹲: "Goblet Squat",
  傳統硬舉: "Deadlift",
  滑輪下拉: "Lat Pulldown",
  滑輪坐姿划船: "Cable Seated Row",
  槓鈴划船: "Barbell Row",
  槓鈴肩推: "Barbell Shoulder Press",
  槓鈴臥推: "Bench Press",
  槓鈴深蹲: "Squat",
  槓鈴握推: "Bench Press",
  腿推機: "Leg Press",
  輔助引體: "Assisted Pull-Up",
  輔助引體向上: "Assisted Pull-Up",
  機械下拉: "Machine Pulldown",
  機械划船: "Machine Row",
  機械肩推: "Machine Shoulder Press",
  機械胸推: "Machine Chest Press",
  臉拉: "Face Pull",
  雙槓抬腿: "Parallel Bar Leg Raise",
};

const setListPattern =
  /^(?<exerciseName>.+?)\s+(?<sets>-?\d+(?:\.\d+)?(?:[xX]\d+)?(?:[xX]\d+)?(?:\s*[,，]\s*-?\d+(?:\.\d+)?(?:[xX]\d+)?(?:[xX]\d+)?)*)$/;

const setPattern =
  /^(?<weight>-?\d+(?:\.\d+)?)(?:[xX](?<reps>\d+))?(?:[xX](?<sets>\d+))?$/;

export function translateExerciseName(exerciseName: string) {
  const normalizedName = exerciseName.trim();
  return exerciseTranslations[normalizedName];
}

export function parseWorkoutLine(line: string):
  | {
      type: "sets";
      exerciseNameZh: string;
      exerciseNameEn: string;
      sets: Array<{ weight: number; reps: number }>;
    }
  | { type: "note"; note: string } {
  const normalizedLine = line
    .trim()
    .replace(/^[-*]\s+/, "")
    .trim();
  const match = normalizedLine.match(setListPattern);

  if (!match?.groups) {
    return { type: "note", note: normalizedLine };
  }

  const exerciseNameZh = match.groups.exerciseName.trim();
  const exerciseNameEn = translateExerciseName(exerciseNameZh);

  if (!exerciseNameEn) {
    return {
      type: "note",
      note: `Unmapped exercise name: ${exerciseNameZh} | ${normalizedLine}`,
    };
  }

  const sets: Array<{ weight: number; reps: number }> = [];

  for (const setText of match.groups.sets.split(/[,，]/)) {
    const setMatch = setText.trim().match(setPattern);

    if (!setMatch?.groups) {
      return { type: "note", note: normalizedLine };
    }

    const weight = Number(setMatch.groups.weight);
    const reps = setMatch.groups.reps ? Number(setMatch.groups.reps) : 1;
    const setCount = setMatch.groups.sets ? Number(setMatch.groups.sets) : 1;

    if (
      !Number.isFinite(weight) ||
      !Number.isInteger(reps) ||
      !Number.isInteger(setCount) ||
      reps < 1 ||
      setCount < 1
    ) {
      return { type: "note", note: normalizedLine };
    }

    for (let index = 0; index < setCount; index += 1) {
      sets.push({ weight, reps });
    }
  }

  return {
    type: "sets",
    exerciseNameZh,
    exerciseNameEn,
    sets,
  };
}

export function stringifyWorkoutCsv(rows: WorkoutCsvRow[]) {
  return [
    workoutCsvHeaders.join(","),
    ...rows.map((row) =>
      workoutCsvHeaders.map((header) => encodeCsvCell(row[header])).join(","),
    ),
  ].join("\n");
}

export function parseWorkoutCsv(input: string) {
  const records = parseCsvRecords(input);
  const [headers, ...rows] = records;

  if (!headers) {
    return [];
  }

  const invalidHeaders =
    headers.length !== workoutCsvHeaders.length ||
    workoutCsvHeaders.some((header, index) => headers[index] !== header);

  if (invalidHeaders) {
    throw new Error(
      `Invalid workouts CSV header. Expected: ${workoutCsvHeaders.join(",")}`,
    );
  }

  return rows
    .filter((row) => row.some((cell) => cell.trim() !== ""))
    .map(parseWorkoutCsvRow);
}

function parseWorkoutCsvRow(row: string[]) {
  const values = Object.fromEntries(
    workoutCsvHeaders.map((header, index) => [header, row[index] ?? ""]),
  );

  if (values.rowType === "note") {
    return {
      date: values.date,
      sourceFile: values.sourceFile,
      rowType: "note",
      exerciseNameZh: "",
      exerciseNameEn: "",
      order: "",
      weight: "",
      reps: "",
      note: values.note,
      rawLine: values.rawLine,
    } satisfies WorkoutCsvRow;
  }

  if (values.rowType !== "set") {
    throw new Error(`Invalid rowType: ${values.rowType}`);
  }

  const order = Number(values.order);
  const weight = Number(values.weight);
  const reps = Number(values.reps);

  if (
    !values.date ||
    !values.sourceFile ||
    !values.exerciseNameZh ||
    !values.exerciseNameEn ||
    !Number.isInteger(order) ||
    !Number.isFinite(weight) ||
    !Number.isInteger(reps)
  ) {
    throw new Error(`Invalid set row: ${JSON.stringify(values)}`);
  }

  return {
    date: values.date,
    sourceFile: values.sourceFile,
    rowType: "set",
    exerciseNameZh: values.exerciseNameZh,
    exerciseNameEn: values.exerciseNameEn,
    order,
    weight,
    reps,
    note: "",
    rawLine: values.rawLine,
  } satisfies WorkoutCsvRow;
}

function encodeCsvCell(value: string | number) {
  const text = String(value);

  if (!/[",\n\r]/.test(text)) {
    return text;
  }

  return `"${text.replaceAll('"', '""')}"`;
}

function parseCsvRecords(input: string) {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const nextCharacter = input[index + 1];

    if (inQuotes) {
      if (character === '"' && nextCharacter === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        inQuotes = false;
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"') {
      inQuotes = true;
    } else if (character === ",") {
      record.push(cell);
      cell = "";
    } else if (character === "\n") {
      record.push(cell);
      records.push(record);
      record = [];
      cell = "";
    } else if (character !== "\r") {
      cell += character;
    }
  }

  if (inQuotes) {
    throw new Error("Invalid CSV: unterminated quoted field");
  }

  if (cell !== "" || record.length > 0) {
    record.push(cell);
    records.push(record);
  }

  return records;
}
