import { z } from "zod";

export const usernameSchema = z.string().trim().min(1).max(64);
export const passwordSchema = z.string().min(1).max(256);
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

export const createSetSchema = z.object({
  exerciseId: z.string().min(1),
  weight: z.coerce.number().min(0).max(2000),
  reps: z.coerce.number().int().min(1).max(1000),
  order: z.coerce.number().int().min(1).max(1000),
  notes: z.string().trim().max(1000).optional(),
});

export const createExerciseSchema = z.object({
  defaultName: z.string().trim().min(1).max(120),
});

export const createAliasSchema = z.object({
  exerciseId: z.string().min(1),
  locale: z.string().trim().min(2).max(12),
  alias: z.string().trim().min(1).max(120),
});
