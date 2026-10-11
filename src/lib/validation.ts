import { z } from "zod";
import { equipment, muscles } from "./training";

export const usernameSchema = z.string().trim().min(1).max(64);
export const passwordSchema = z.string().min(1).max(256);
export const passkeyNameSchema = z.string().trim().min(1).max(80);
export const newPasswordSchema = z.string().min(8).max(256);

export const changePasswordSchema = z
  .object({
    currentPassword: passwordSchema,
    newPassword: newPasswordSchema,
    confirmPassword: passwordSchema,
  })
  .refine((input) => input.newPassword === input.confirmPassword, {
    path: ["confirmPassword"],
  });

export const createWorkoutSchema = z.object({
  title: z.string().trim().max(120).optional(),
  date: z.string().date(),
  notes: z.string().trim().max(2000).optional(),
});

export const updateWorkoutSchema = createWorkoutSchema.extend({
  workoutId: z.string().min(1),
});

export const duplicateWorkoutSchema = z.object({
  sourceWorkoutId: z.string().min(1),
  date: z.string().date(),
});

export const optionalRirSchema = z.preprocess(
  (value) => (value === "" || value == null ? null : value),
  z.coerce.number().finite().min(0).max(10).multipleOf(0.5).nullable(),
);
export const createSetSchema = z.object({
  type: z.enum(["WORKING", "WARMUP"]).default("WORKING"),
  rir: optionalRirSchema,
  exerciseId: z.string().min(1),
  weight: z.coerce.number().min(0).max(2000),
  reps: z.coerce.number().int().min(1).max(1000),
  order: z.coerce.number().int().min(1).max(1000),
  notes: z.string().trim().max(1000).optional(),
});

export const updateSetSchema = createSetSchema.extend({
  workoutId: z.string().min(1),
  setId: z.string().min(1),
});

export const saveWorkoutTemplateSchema = z.object({
  workoutId: z.string().min(1),
  title: z.string().trim().min(1).max(120),
});

export const createWorkoutFromTemplateSchema = z.object({
  templateId: z.string().min(1),
  date: z.string().date(),
});

export const deleteWorkoutTemplateSchema = z.object({
  templateId: z.string().min(1),
});

export const createExerciseSchema = z.object({
  defaultName: z.string().trim().min(1).max(120),
});

export const updateExerciseSchema = createExerciseSchema.extend({
  exerciseId: z.string().min(1),
});

export const importMappingsSchema = z
  .record(z.string().max(120), z.string().min(1).max(128))
  .refine((value) => Object.keys(value).length <= 20000);

export const metadataSchema = z
  .object({
    exerciseId: z.string().min(1),
    primary: z.array(z.enum(muscles)),
    secondary: z.array(z.enum(muscles)),
    equipment: z.array(z.enum(equipment)),
  })
  .refine(
    (input) =>
      new Set([...input.primary, ...input.secondary]).size ===
        input.primary.length + input.secondary.length &&
      new Set(input.equipment).size === input.equipment.length,
  );

export const measurementSchema = z
  .object({
    date: z.string().date(),
    weight: z.preprocess(
      (v) => (v === "" || v == null ? null : v),
      z.coerce.number().finite().positive().max(500).nullable(),
    ),
    waist: z.preprocess(
      (v) => (v === "" || v == null ? null : v),
      z.coerce.number().finite().positive().max(300).nullable(),
    ),
  })
  .refine((v) => v.weight !== null || v.waist !== null);
export const goalSchema = z.preprocess(
  (v) => (v === "" || v == null ? null : v),
  z.coerce.number().finite().positive().max(500).nullable(),
);
export const sessionStartSchema = z.object({
  sourceId: z.string().min(1),
  source: z.enum(["template", "workout"]),
  date: z.string().date(),
  key: z.string().uuid(),
  restSeconds: z.coerce.number().int().min(0).max(3600),
  scheduled: z.boolean().default(false),
});
export const sessionActualsSchema = createSetSchema
  .pick({
    weight: true,
    reps: true,
    rir: true,
    notes: true,
  })
  .extend({
    weight: z
      .union([z.number(), z.string().trim().min(1)])
      .pipe(z.coerce.number<string | number>().finite().min(0).max(2000)),
  });
export const sessionChangeSchema = z.object({
  workoutId: z.string().min(1),
  version: z.coerce.number().int().min(0),
  command: z.enum(["pause", "resume", "finish", "abandon", "complete"]),
  setId: z.string().optional(),
  actuals: sessionActualsSchema.optional(),
  partial: z.boolean().default(false),
});
export const progressionRuleSchema = z.object({
  templateId: z.string().min(1),
  exerciseId: z.string().min(1),
  increment: z.coerce.number().finite().positive().max(100).multipleOf(0.001),
});
export const scheduleSchema = z.object({
  weekday: z.coerce.number().int().min(0).max(6),
  templateId: z.string(),
});

export const createAliasSchema = z.object({
  exerciseId: z.string().min(1),
  locale: z.string().trim().min(2).max(12),
  alias: z.string().trim().min(1).max(120),
});
