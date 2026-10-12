import { ZodError } from "zod";

export type FormErrorCode =
  | "invalidSessionInput"
  | "sessionConflict"
  | "sessionIncomplete"
  | "sessionUnavailable"
  | "invalidWorkoutInput";
export type FormFailure = { error: FormErrorCode };

export class SessionError extends Error {
  constructor(
    public readonly code: Exclude<FormErrorCode, "invalidWorkoutInput">,
  ) {
    super(code);
  }
}

// Only expected domain/validation errors may become client-visible outcomes.
export async function sessionOutcome(
  operation: () => Promise<void>,
): Promise<FormFailure | undefined> {
  try {
    await operation();
  } catch (error) {
    if (error instanceof SessionError) return { error: error.code };
    if (error instanceof ZodError) return { error: "invalidSessionInput" };
    throw error;
  }
}
