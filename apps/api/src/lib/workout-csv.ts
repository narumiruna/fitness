import { createHash } from "node:crypto";
import { parseDateKey } from "@narumitw/fitness-core/calendar";
import { z } from "zod";
import { ApiError } from "../errors.js";
import { normalizeExerciseAlias } from "./exercises.js";

export const csvLimit = 5 * 1024 * 1024;
export const csvRows = 20000;
export const csvColumns = [
  "version",
  "workout_key",
  "date",
  "title",
  "workout_notes",
  "state",
  "active_seconds",
  "template_title",
  "order",
  "exercise",
  "weight_kg",
  "reps",
  "set_notes",
  "set_type",
  "rir",
  "completed",
  "target_weight_kg",
  "target_reps",
] as const;
export type TransferSet = {
  order: number;
  exercise: string;
  weight: number;
  reps: number;
  notes: string | null;
  type: "WORKING" | "WARMUP";
  rir: number | null;
  completed: boolean;
  targetWeight: number | null;
  targetReps: number | null;
};
export type TransferWorkout = {
  key: string;
  date: string;
  title: string | null;
  notes: string | null;
  state: string;
  activeSeconds: number;
  templateTitle: string | null;
  sets: TransferSet[];
};
const number = (text: string, min: number, max: number, integer = false) => {
  if (!text.trim() || !/^\d+(\.\d+)?(e[+-]?\d+)?$/i.test(text))
    throw new Error("Invalid numeric field.");
  const value = Number(text);
  if (
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  )
    throw new Error("Number out of range.");
  return value;
};
const optionalNumber = (
  text: string,
  min: number,
  max: number,
  integer = false,
) => (text === "" ? null : number(text, min, max, integer));
// All non-null text cells are prefixed, including empty strings and apostrophes. Decode one prefix.
export const encodeText = (text: string | null) =>
  text === null ? "" : `'${text}`;
export function decodeText(text: string, max: number) {
  if (text === "") return null;
  if (!text.startsWith("'")) throw new Error("Text must use app CSV encoding.");
  return z.string().max(max).parse(text.slice(1));
}
export function parseCsv(text: string) {
  if (Buffer.byteLength(text, "utf8") > csvLimit)
    throw new Error("CSV exceeds 5 MiB.");
  text = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let closed = false;
  const pushCell = () => {
    row.push(cell);
    cell = "";
    closed = false;
    if (row.length > csvColumns.length) throw new Error("Too many columns.");
  };
  const pushRow = () => {
    pushCell();
    rows.push(row);
    row = [];
    if (rows.length > csvRows + 1) throw new Error("CSV exceeds 20,000 rows.");
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += ch;
      continue;
    }
    if (ch === '"') {
      if (cell || closed) throw new Error("Invalid CSV quote.");
      quoted = true;
    } else if (ch === ",") pushCell();
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      pushRow();
    } else {
      if (closed) throw new Error("Text after CSV quote.");
      cell += ch;
    }
  }
  if (quoted) throw new Error("Unclosed CSV quote.");
  if (cell || row.length || closed) pushRow();
  return rows;
}
export function parseWorkouts(text: string) {
  const rows = parseCsv(text);
  if (JSON.stringify(rows.shift()) !== JSON.stringify(csvColumns))
    throw new Error("Unsupported app CSV header.");
  const errors: number[] = [];
  const workouts = new Map<string, TransferWorkout>();
  rows.forEach((r, index) => {
    try {
      if (r.length !== csvColumns.length || r[0] !== "1")
        throw new Error("Unsupported version or column count.");
      const key = z.string().min(1).max(128).parse(r[1]);
      if (!parseDateKey(r[2])) throw new ApiError(400, "VALIDATION_ERROR");
      const w: TransferWorkout = {
        key,
        date: r[2],
        title: decodeText(r[3], 120),
        notes: decodeText(r[4], 2000),
        state: z
          .enum(["ACTIVE", "PAUSED", "COMPLETED", "ABANDONED"])
          .parse(r[5]),
        activeSeconds: number(r[6], 0, 31536000, true),
        templateTitle: decodeText(r[7], 120),
        sets: [],
      };
      const current = workouts.get(key);
      if (
        current &&
        JSON.stringify({ ...current, sets: [] }) !== JSON.stringify(w)
      )
        throw new Error("Conflicting workout fields.");
      const entry = current ?? w;
      if (r[8] === "") {
        if (r.slice(9).some(Boolean) || current)
          throw new Error("Invalid empty workout.");
      } else {
        const rir = optionalNumber(r[14], 0, 10);
        if (rir !== null && rir * 2 !== Math.floor(rir * 2))
          throw new Error("Invalid RIR step.");
        const targetWeight = optionalNumber(r[16], 0, 2000);
        const targetReps = optionalNumber(r[17], 1, 1000, true);
        if ((targetWeight === null) !== (targetReps === null))
          throw new Error("Incomplete target.");
        const exercise = decodeText(r[9], 120);
        if (!exercise?.trim()) throw new Error("Missing exercise.");
        entry.sets.push({
          order: number(r[8], 1, 1000, true),
          exercise,
          weight: number(r[10], 0, 2000),
          reps: number(r[11], 1, 1000, true),
          notes: decodeText(r[12], 1000),
          type: z.enum(["WORKING", "WARMUP"]).parse(r[13]),
          rir,
          completed: z.enum(["true", "false"]).parse(r[15]) === "true",
          targetWeight,
          targetReps,
        });
      }
      workouts.set(key, entry);
    } catch {
      errors.push(index + 2);
    }
  });
  return { workouts: [...workouts.values()], errors, rows: rows.length };
}
export function serializeWorkouts(workouts: TransferWorkout[]) {
  const rows: string[][] = [Array.from(csvColumns)];
  for (const w of workouts) {
    const base = [
      "1",
      w.key,
      w.date,
      encodeText(w.title),
      encodeText(w.notes),
      w.state,
      String(w.activeSeconds),
      encodeText(w.templateTitle),
    ];
    if (!w.sets.length) rows.push([...base, ...Array<string>(10).fill("")]);
    for (const s of w.sets)
      rows.push([
        ...base,
        String(s.order),
        encodeText(s.exercise),
        String(s.weight),
        String(s.reps),
        encodeText(s.notes),
        s.type,
        s.rir === null ? "" : String(s.rir),
        String(s.completed),
        s.targetWeight === null ? "" : String(s.targetWeight),
        s.targetReps === null ? "" : String(s.targetReps),
      ]);
  }
  const result = `${rows
    .map((row) =>
      row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(","),
    )
    .join("\r\n")}\r\n`;
  return result;
}
export function workoutFingerprint(w: TransferWorkout) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        date: w.date,
        title: w.title,
        notes: w.notes,
        state: w.state,
        activeSeconds: w.activeSeconds,
        templateTitle: w.templateTitle,
        sets: w.sets
          .map((s) => ({
            order: s.order,
            exercise: normalizeExerciseAlias(s.exercise),
            weight: s.weight,
            reps: s.reps,
            notes: s.notes,
            type: s.type,
            rir: s.rir,
            completed: s.completed,
            targetWeight: s.targetWeight,
            targetReps: s.targetReps,
          }))
          .sort(
            (a, b) =>
              a.order - b.order ||
              JSON.stringify(a).localeCompare(JSON.stringify(b)),
          ),
      }),
    )
    .digest("hex");
}

// Preserve the multiplicity of identical same-day sessions with distinct export keys.
export function occurrenceFingerprint(
  w: TransferWorkout,
  counts: Map<string, number>,
) {
  const content = workoutFingerprint(w);
  const ordinal = (counts.get(content) ?? 0) + 1;
  counts.set(content, ordinal);
  return ordinal === 1
    ? content
    : createHash("sha256").update(`${content}:${ordinal}`).digest("hex");
}
