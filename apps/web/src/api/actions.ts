import { actionEnvelopeSchema } from "@narumitw/fitness-contracts";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";
import { z } from "zod";
import {
  clearPrivateState,
  HttpError,
  queryClient,
  refreshViews,
  request,
} from "./client";

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
export type FormErrorCode = FormFailure["error"];
export type FormAction = (data: FormData) => Promise<FormFailure | undefined>;

function formFields(data: FormData) {
  const fields: Record<string, string | string[]> = {};
  for (const [name, value] of data) {
    if (typeof value !== "string") throw new Error("Unexpected file field");
    const previous = fields[name];
    fields[name] =
      previous === undefined
        ? value
        : Array.isArray(previous)
          ? [...previous, value]
          : [previous, value];
  }
  return fields;
}

async function invoke(
  name: string,
  data: FormData | Record<string, unknown>,
  multipart = false,
) {
  const envelope = await request(`/api/actions/${name}`, actionEnvelopeSchema, {
    method: "POST",
    ...(multipart
      ? { body: data as FormData }
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            data instanceof FormData ? formFields(data) : data,
          ),
        }),
  });
  const destination = envelope.redirect
    ? new URL(envelope.redirect, window.location.origin)
    : null;
  if (destination && destination.origin !== window.location.origin)
    throw new HttpError(200, "INVALID_RESPONSE");
  const failure = formFailureSchema.safeParse(envelope.result);
  if (failure.success) return envelope;
  if (
    [
      "passkeyRegistrationOptions",
      "passkeyAuthenticationOptions",
      "previewImportAction",
    ].includes(name)
  )
    return envelope;
  const accountChanged =
    name === "logoutAction" ||
    (name === "authenticatePasskey" && envelope.result === true) ||
    ((name === "loginAction" || name === "setupAdminAction") &&
      envelope.redirect === "/workouts");
  if (accountChanged) clearPrivateState();
  if (
    [
      "loginAction",
      "logoutAction",
      "setupAdminAction",
      "authenticatePasskey",
      "changePasswordAction",
      "setLocaleAction",
    ].includes(name)
  )
    await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
  await refreshViews();
  if (destination)
    window.dispatchEvent(
      new CustomEvent("fitness:navigate", {
        detail: `${destination.pathname}${destination.search}${destination.hash}`,
      }),
    );
  return envelope;
}

function formAction(name: string): FormAction {
  return async (data) => {
    const envelope = await invoke(name, data);
    const failure = formFailureSchema.safeParse(envelope.result);
    return failure.success ? failure.data : undefined;
  };
}

export const loginAction = formAction("loginAction");
export const logoutAction = formAction("logoutAction");
export const setupAdminAction = formAction("setupAdminAction");
export const changePasswordAction = formAction("changePasswordAction");
export const createUserAction = formAction("createUserAction");
export const createWorkoutAction = formAction("createWorkoutAction");
export const updateWorkoutAction = formAction("updateWorkoutAction");
export const duplicateWorkoutAction = formAction("duplicateWorkoutAction");
export const createWorkoutSetAction = formAction("createWorkoutSetAction");
export const updateWorkoutSetAction = formAction("updateWorkoutSetAction");
export const deleteWorkoutSetAction = formAction("deleteWorkoutSetAction");
export const deleteWorkoutAction = formAction("deleteWorkoutAction");
export const saveWorkoutTemplateAction = formAction(
  "saveWorkoutTemplateAction",
);
export const createWorkoutFromTemplateAction = formAction(
  "createWorkoutFromTemplateAction",
);
export const deleteWorkoutTemplateAction = formAction(
  "deleteWorkoutTemplateAction",
);
export const saveMeasurementAction = formAction("saveMeasurementAction");
export const deleteMeasurementAction = formAction("deleteMeasurementAction");
export const saveGoalAction = formAction("saveGoalAction");
export const startSessionAction = formAction("startSessionAction");
export const editSessionSetAction = formAction("editSessionSetAction");
export const changeSessionAction = formAction("changeSessionAction");
export const createExerciseAction = formAction("createExerciseAction");
export const updateExerciseAction = formAction("updateExerciseAction");
export const createExerciseAliasAction = formAction(
  "createExerciseAliasAction",
);
export const saveProgressionRuleAction = formAction(
  "saveProgressionRuleAction",
);
export const acceptProgressionAction = formAction("acceptProgressionAction");
export const saveScheduleAction = formAction("saveScheduleAction");
export const saveMetadataAction = formAction("saveMetadataAction");
export const deletePasskey = formAction("deletePasskey");
export async function setLocaleAction(locale: string) {
  return z
    .boolean()
    .parse((await invoke("setLocaleAction", { locale })).result);
}

const previewSchema = z.object({
  rows: z.number(),
  workouts: z.number(),
  duplicates: z.number(),
  errors: z.array(z.number()),
  unknown: z.array(z.string()),
  exercises: z.array(z.object({ id: z.string(), name: z.string() })),
});
export async function previewImportAction(data: FormData) {
  return previewSchema.parse(
    (await invoke("previewImportAction", data, true)).result,
  );
}
export async function confirmImportAction(data: FormData) {
  return z
    .object({ imported: z.number(), skipped: z.number() })
    .parse((await invoke("confirmImportAction", data, true)).result);
}

// Validate every browser-used option before passing the protocol object to WebAuthn.
const verification = z.enum(["required", "preferred", "discouraged"]);
const credential = z.object({
  id: z.string(),
  type: z.literal("public-key"),
  transports: z
    .array(z.enum(["ble", "hybrid", "internal", "nfc", "usb"]))
    .optional(),
});
const hints = z.array(z.enum(["hybrid", "security-key", "client-device"]));
const extensions = z.object({
  appid: z.string().optional(),
  credProps: z.boolean().optional(),
  hmacCreateSecret: z.boolean().optional(),
  minPinLength: z.boolean().optional(),
});
const requestOptions = z.object({
  challenge: z.string(),
  rpId: z.string().optional(),
  timeout: z.number().optional(),
  allowCredentials: z.array(credential).optional(),
  userVerification: verification.optional(),
  hints: hints.optional(),
  extensions: extensions.optional(),
});
const registrationOptions = z.object({
  challenge: z.string(),
  rp: z.object({ name: z.string(), id: z.string().optional() }),
  user: z.object({ id: z.string(), name: z.string(), displayName: z.string() }),
  pubKeyCredParams: z.array(
    z.object({ type: z.literal("public-key"), alg: z.number() }),
  ),
  timeout: z.number().optional(),
  excludeCredentials: z.array(credential).optional(),
  authenticatorSelection: z
    .object({
      authenticatorAttachment: z
        .enum(["platform", "cross-platform"])
        .optional(),
      requireResidentKey: z.boolean().optional(),
      residentKey: verification.optional(),
      userVerification: verification.optional(),
    })
    .optional(),
  hints: hints.optional(),
  attestation: z.enum(["direct", "enterprise", "indirect", "none"]).optional(),
  attestationFormats: z
    .array(
      z.enum([
        "fido-u2f",
        "packed",
        "android-safetynet",
        "android-key",
        "tpm",
        "apple",
        "none",
      ]),
    )
    .optional(),
  extensions: extensions.optional(),
});
export async function passkeyRegistrationOptions(
  password: string,
  name: string,
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  return registrationOptions.parse(
    (await invoke("passkeyRegistrationOptions", { password, name })).result,
  );
}
export async function passkeyAuthenticationOptions(): Promise<PublicKeyCredentialRequestOptionsJSON> {
  return requestOptions.parse(
    (await invoke("passkeyAuthenticationOptions", {})).result,
  );
}
export async function registerPasskey(
  response: RegistrationResponseJSON,
  name: string,
) {
  return z
    .boolean()
    .parse((await invoke("registerPasskey", { response, name })).result);
}
export async function authenticatePasskey(
  response: AuthenticationResponseJSON,
) {
  return z
    .boolean()
    .parse((await invoke("authenticatePasskey", { response })).result);
}
