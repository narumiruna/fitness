import { z } from "zod";

export {
  defaultLocale,
  isSupportedLocale,
  type Locale,
  languageOptions,
  resolveLocale,
  supportedLocales,
} from "./locales.js";

export const dateOnlySchema = z.iso.date();
export const timestampSchema = z.iso.datetime();
const id = z.string().min(1);
const number = z.number().finite();
const nullableText = z.string().nullable();
export const userSchema = z.object({
  id,
  username: z.string(),
  role: z.string(),
});
export type CurrentUser = z.infer<typeof userSchema>;
export const bootstrapSchema = z.object({
  user: userSchema.nullable(),
  hasUsers: z.boolean(),
  locale: z.enum(["en", "zh-TW"]),
});
export type Bootstrap = z.infer<typeof bootstrapSchema>;
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum([
      "VALIDATION_ERROR",
      "AUTHENTICATION_REQUIRED",
      "FORBIDDEN",
      "NOT_FOUND",
      "CONFLICT",
      "BODY_TOO_LARGE",
      "UNSUPPORTED_MEDIA_TYPE",
      "METHOD_NOT_ALLOWED",
      "CHALLENGE_CAPACITY",
      "INTERNAL_ERROR",
    ]),
    requestId: z.string(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
export const formFieldsSchema = z.record(
  z.string().max(128),
  z.union([z.string(), z.array(z.string()).max(64)]),
);
// JSON-safe data is not a substitute for endpoint-specific schemas below.
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    number,
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);
export const actionEnvelopeSchema = z.object({
  result: jsonValueSchema.optional(),
  redirect: z
    .string()
    .startsWith("/")
    .refine(
      (value) =>
        !value.startsWith("//") && !value.includes("\\") && !/\s/.test(value),
    )
    .optional(),
});
export type ActionEnvelope<T = JsonValue> = { result?: T; redirect?: string };

export const aliasSchema = z.object({
  id,
  exerciseId: id,
  locale: z.string(),
  alias: z.string(),
  normalizedAlias: z.string(),
});
export const muscleSchema = z.object({
  exerciseId: id,
  muscle: z.string(),
  role: z.string(),
});
export const equipmentSchema = z.object({
  exerciseId: id,
  equipment: z.string(),
});
export const exerciseSchema = z.object({
  id,
  slug: z.string(),
  defaultName: z.string(),
  createdByUserId: id.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  aliases: z.array(aliasSchema).optional(),
  muscles: z.array(muscleSchema).optional(),
  equipment: z.array(equipmentSchema).optional(),
});
export type Exercise = z.infer<typeof exerciseSchema>;
export const workoutSetSchema = z.object({
  id,
  workoutId: id,
  exerciseId: id,
  order: number,
  weight: number,
  reps: number,
  notes: nullableText,
  type: z.string(),
  rir: number.nullable(),
  completed: z.boolean(),
  actualsEntered: z.boolean(),
  targetWeight: number.nullable(),
  targetReps: number.nullable(),
  exercise: exerciseSchema.optional(),
});
export const workoutSchema = z.object({
  id,
  userId: id,
  date: dateOnlySchema,
  title: nullableText,
  notes: nullableText,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  state: z.string(),
  version: number,
  startedAt: timestampSchema.nullable(),
  resumedAt: timestampSchema.nullable(),
  finishedAt: timestampSchema.nullable(),
  activeSeconds: number,
  restSeconds: number,
  restDeadline: timestampSchema.nullable(),
  templateId: id.nullable(),
  templateTitle: nullableText,
  plannedDate: dateOnlySchema.nullable(),
  sets: z.array(workoutSetSchema),
});
export type Workout = z.infer<typeof workoutSchema>;
export type WorkoutSet = z.infer<typeof workoutSetSchema>;
export const templateSetSchema = z.object({
  id,
  templateId: id,
  exerciseId: id,
  order: number,
  weight: number,
  reps: number,
  notes: nullableText,
  type: z.string(),
  exercise: exerciseSchema.optional(),
});
export const progressionRuleSchema = z.object({
  templateId: id,
  exerciseId: id,
  increment: number,
});
export const templateSchema = z.object({
  id,
  userId: id,
  title: z.string(),
  notes: nullableText,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  sets: z.array(templateSetSchema).optional(),
  rules: z.array(progressionRuleSchema).optional(),
  _count: z.object({ sets: number }).optional(),
});
export const scheduleSchema = z.object({
  id,
  userId: id,
  templateId: id.nullable(),
  title: z.string(),
  weekday: number,
  effectiveFrom: dateOnlySchema,
  effectiveTo: dateOnlySchema.nullable(),
});
export const historySchema = z.record(
  z.string(),
  z.object({
    date: z.string(),
    sets: z.array(z.object({ id, weight: number, reps: number })),
  }),
);
export const previewSchema = z.object({
  exerciseId: id,
  increment: number,
  sourceId: id.nullable(),
  sourceDate: dateOnlySchema.nullable(),
  version: number,
  reason: z.string(),
  weight: number.nullable(),
});
export const workoutViewSchema = z.object({
  today: dateOnlySchema,
  workout: workoutSchema,
  exercises: z.array(exerciseSchema),
  history: historySchema,
  previews: z.array(previewSchema),
});
const filtersSchema = z.object({
  exerciseId: z.string(),
  month: z.string(),
  notesOnly: z.boolean(),
  page: number,
  q: z.string(),
});
export const workoutsViewSchema = z.object({
  filteredWorkoutCount: number,
  totalHistoryCount: number,
  totalWorkoutCount: number,
  workoutsThisMonth: number,
  totals: z.array(z.object({ count: number, volume: number })),
  totalPages: number,
  currentPage: number,
  workouts: z.array(workoutSchema),
  exerciseOptions: z.array(z.object({ id, defaultName: z.string() })),
  templates: z.array(templateSchema),
  filters: filtersSchema,
  today: dateOnlySchema,
  calendarWorkouts: z.array(z.object({ date: dateOnlySchema })),
  planningTemplates: z.array(templateSchema),
  schedules: z.array(scheduleSchema),
});
export const exerciseViewSchema = z.object({
  today: dateOnlySchema,
  exercise: exerciseSchema,
  workouts: z.array(workoutSchema),
});
export const exercisesViewSchema = z.object({
  exercises: z.array(exerciseSchema),
  totalExerciseCount: number,
  totalAliasCount: number,
  usedExercises: z.array(
    z.object({
      exerciseId: id,
      name: z.string(),
      date: dateOnlySchema,
      count: number,
    }),
  ),
  muscleGroups: z.array(z.object({ muscle: z.string(), _count: number })),
});
export const calendarViewSchema = z.object({
  today: dateOnlySchema,
  workouts: z.array(workoutSchema),
  schedules: z.array(scheduleSchema),
  sessions: z.array(workoutSchema),
});
const period = z.object({
  workouts: number,
  sets: number,
  reps: number,
  volume: number,
});
const setRecord = z.object({
  value: number,
  weight: number,
  reps: number,
  date: dateOnlySchema,
});
const personalRecord = z.object({
  exerciseId: id,
  exerciseName: z.string(),
  maxWeight: setRecord,
  maxReps: setRecord,
  maxVolume: setRecord,
  estimatedOneRepMax: setRecord,
});
const chartPoint = z.object({
  key: z.string(),
  label: z.string(),
  value: number,
});
export const statsSchema = z.object({
  overview: z.object({
    totalWorkouts: number,
    trainingDays: number,
    totalSets: number,
    totalReps: number,
    totalVolume: number,
    averageVolumePerWorkout: number,
  }),
  currentPeriod: period,
  previousPeriod: period,
  monthlyTrend: z.array(
    period
      .omit({ workouts: true })
      .extend({ key: z.string(), label: z.string(), workouts: number }),
  ),
  exerciseLeaders: z.array(
    z.object({
      exerciseId: id,
      exerciseName: z.string(),
      sets: number,
      reps: number,
      volume: number,
    }),
  ),
  personalRecords: z.array(personalRecord),
  allTimeRecords: z.array(personalRecord),
  workingVolume: number,
  daily: z.array(chartPoint),
  weekly: z.array(chartPoint),
  weeklyBucketWeeks: number,
  distribution: z.array(chartPoint),
});
const muscleSetSchema = workoutSetSchema.extend({
  exercise: exerciseSchema.extend({ muscles: z.array(muscleSchema) }),
});
export const statsViewSchema = z.object({
  today: dateOnlySchema,
  stats: statsSchema,
  consistencyHistory: z.array(z.object({ date: dateOnlySchema })),
  muscleSets: z.array(muscleSetSchema),
});
export const measurementsViewSchema = z.object({
  today: dateOnlySchema,
  records: z.array(
    z.object({
      id,
      date: dateOnlySchema,
      weight: number.nullable(),
      waist: number.nullable(),
      updatedAt: timestampSchema,
    }),
  ),
  goal: z.object({ weight: number.nullable() }).nullable(),
});
export const usersViewSchema = z.object({
  users: z.array(userSchema.extend({ createdAt: timestampSchema })),
});
export const passkeysViewSchema = z.object({
  passkeys: z.array(
    z.object({
      id,
      name: z.string(),
      createdAt: timestampSchema,
      lastUsedAt: timestampSchema.nullable(),
    }),
  ),
});
export const newViewSchema = z.object({
  key: z.string().uuid(),
  initialDate: dateOnlySchema,
});
export const dashboardViewSchema = z.object({
  calendarWorkouts: z.array(z.object({ date: dateOnlySchema })),
  templates: z.array(templateSchema),
  schedules: z.array(scheduleSchema),
  consistencyHistory: z.array(z.object({ date: dateOnlySchema })),
  muscleSets: z.array(muscleSetSchema),
});
export const dataViewSchema = z.object({
  exercises: z.array(z.object({ id, defaultName: z.string() })),
});
export const viewSchemas = {
  workouts: workoutsViewSchema,
  workout: workoutViewSchema,
  exercises: exercisesViewSchema,
  exercise: exerciseViewSchema,
  calendar: calendarViewSchema,
  stats: statsViewSchema,
  measurements: measurementsViewSchema,
  users: usersViewSchema,
  passkeys: passkeysViewSchema,
  new: newViewSchema,
  dashboard: dashboardViewSchema,
  data: dataViewSchema,
} as const;
export type ViewName = keyof typeof viewSchemas;
export type ViewDto<N extends ViewName> = z.infer<(typeof viewSchemas)[N]>;
export type WorkoutsView = ViewDto<"workouts">;
export type WorkoutView = ViewDto<"workout">;
export type ExercisesView = ViewDto<"exercises">;
export type ExerciseView = ViewDto<"exercise">;
export type CalendarView = ViewDto<"calendar">;
export type StatsView = ViewDto<"stats">;
export type MeasurementsView = ViewDto<"measurements">;
export type UsersView = ViewDto<"users">;
export type PasskeysView = ViewDto<"passkeys">;
export type NewView = ViewDto<"new">;
export type DashboardView = ViewDto<"dashboard">;
export type DataView = ViewDto<"data">;

export {
  type ActionName,
  type ActionRequest,
  actionNames,
  authenticatePasskeyRequestSchema,
  type FormFailure,
  type FormFields,
  formFailureSchema,
  type ImportConfirmation,
  type ImportPreview,
  importConfirmationSchema,
  importPreviewSchema,
  passkeyRegistrationOptionsRequestSchema,
  registerPasskeyRequestSchema,
} from "./actions.js";
