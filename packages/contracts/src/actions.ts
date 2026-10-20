import { z } from "zod";

export const actionNames = [
  "loginAction",
  "logoutAction",
  "setupAdminAction",
  "changePasswordAction",
  "previewImportAction",
  "confirmImportAction",
  "createExerciseAction",
  "updateExerciseAction",
  "createExerciseAliasAction",
  "setLocaleAction",
  "saveMeasurementAction",
  "deleteMeasurementAction",
  "saveGoalAction",
  "saveMetadataAction",
  "passkeyRegistrationOptions",
  "registerPasskey",
  "passkeyAuthenticationOptions",
  "authenticatePasskey",
  "deletePasskey",
  "saveProgressionRuleAction",
  "acceptProgressionAction",
  "saveScheduleAction",
  "startSessionAction",
  "editSessionSetAction",
  "changeSessionAction",
  "createUserAction",
  "createWorkoutAction",
  "updateWorkoutAction",
  "duplicateWorkoutAction",
  "createWorkoutSetAction",
  "updateWorkoutSetAction",
  "deleteWorkoutSetAction",
  "deleteWorkoutAction",
  "saveWorkoutTemplateAction",
  "createWorkoutFromTemplateAction",
  "deleteWorkoutTemplateAction",
] as const;
export type ActionName = (typeof actionNames)[number];
export const formFailureSchema = z.object({
  error: z.enum([
    "invalidSessionInput",
    "sessionConflict",
    "sessionIncomplete",
    "sessionUnavailable",
    "invalidWorkoutInput",
  ]),
});
export type FormFailure = z.infer<typeof formFailureSchema>;
export const importPreviewSchema = z.object({
  rows: z.number().int().nonnegative(),
  workouts: z.number().int().nonnegative(),
  errors: z.array(z.number().int().positive()),
  unknown: z.array(z.string()),
  duplicates: z.number().int().nonnegative(),
  exercises: z.array(z.object({ id: z.string(), name: z.string() })),
});
export type ImportPreview = z.infer<typeof importPreviewSchema>;
export const importConfirmationSchema = z.object({
  imported: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
});
export type ImportConfirmation = z.infer<typeof importConfirmationSchema>;

const credentialResponse = z.object({
  id: z.string().min(1).max(2048),
  rawId: z.string().min(1).max(2048),
  type: z.literal("public-key"),
  clientExtensionResults: z.record(z.string(), z.unknown()),
  response: z.record(z.string(), z.unknown()),
  authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional(),
});
export const passkeyRegistrationOptionsRequestSchema = z.object({
  password: z.string().min(1).max(256),
  name: z.string().trim().min(1).max(80),
});
export const registerPasskeyRequestSchema = z.object({
  response: credentialResponse.extend({
    response: z.object({
      clientDataJSON: z.string().max(65536),
      attestationObject: z.string().max(262144),
      transports: z.array(z.string()).max(16).optional(),
      publicKeyAlgorithm: z.number().optional(),
      publicKey: z.string().optional(),
      authenticatorData: z.string().optional(),
    }),
  }),
  name: z.string().trim().min(1).max(80),
});
export const authenticatePasskeyRequestSchema = z.object({
  response: credentialResponse.extend({
    response: z.object({
      clientDataJSON: z.string().max(65536),
      authenticatorData: z.string().max(65536),
      signature: z.string().max(65536),
      userHandle: z.string().max(2048).optional(),
    }),
  }),
});
export type FormFields = Record<string, string | string[]>;
export type ActionRequest<N extends ActionName> = N extends
  | "previewImportAction"
  | "confirmImportAction"
  ? FormData
  : N extends "passkeyRegistrationOptions"
    ? z.infer<typeof passkeyRegistrationOptionsRequestSchema>
    : N extends "registerPasskey"
      ? z.infer<typeof registerPasskeyRequestSchema>
      : N extends "authenticatePasskey"
        ? z.infer<typeof authenticatePasskeyRequestSchema>
        : N extends "passkeyAuthenticationOptions" | "logoutAction"
          ? Record<string, never>
          : N extends "setLocaleAction"
            ? { locale: string }
            : FormFields;
