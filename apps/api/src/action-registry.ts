import {
  changePasswordAction,
  loginAction,
  logoutAction,
  setupAdminAction,
} from "./actions/auth.js";
import {
  confirmImportAction,
  previewImportAction,
} from "./actions/data-transfer.js";
import {
  createExerciseAction,
  createExerciseAliasAction,
  updateExerciseAction,
} from "./actions/exercises.js";
import { setLocaleAction } from "./actions/locale.js";
import {
  deleteMeasurementAction,
  saveGoalAction,
  saveMeasurementAction,
} from "./actions/measurements.js";
import { saveMetadataAction } from "./actions/metadata.js";
import {
  authenticatePasskey,
  deletePasskey,
  passkeyAuthenticationOptions,
  passkeyRegistrationOptions,
  registerPasskey,
} from "./actions/passkeys.js";
import {
  acceptProgressionAction,
  saveProgressionRuleAction,
} from "./actions/progression.js";
import { saveScheduleAction } from "./actions/schedules.js";
import {
  changeSessionAction,
  editSessionSetAction,
  startSessionAction,
} from "./actions/sessions.js";
import { createUserAction } from "./actions/users.js";
import {
  createWorkoutAction,
  createWorkoutFromTemplateAction,
  createWorkoutSetAction,
  deleteWorkoutAction,
  deleteWorkoutSetAction,
  deleteWorkoutTemplateAction,
  duplicateWorkoutAction,
  saveWorkoutTemplateAction,
  updateWorkoutAction,
  updateWorkoutSetAction,
} from "./actions/workouts.js";
export const formActions = {
  loginAction,
  logoutAction,
  setupAdminAction,
  changePasswordAction,
  previewImportAction,
  confirmImportAction,
  createExerciseAction,
  updateExerciseAction,
  createExerciseAliasAction,
  saveMeasurementAction,
  deleteMeasurementAction,
  saveGoalAction,
  saveMetadataAction,
  deletePasskey,
  saveProgressionRuleAction,
  acceptProgressionAction,
  saveScheduleAction,
  startSessionAction,
  editSessionSetAction,
  changeSessionAction,
  createUserAction,
  createWorkoutAction,
  updateWorkoutAction,
  duplicateWorkoutAction,
  createWorkoutSetAction,
  updateWorkoutSetAction,
  deleteWorkoutSetAction,
  deleteWorkoutAction,
  saveWorkoutTemplateAction,
  createWorkoutFromTemplateAction,
  deleteWorkoutTemplateAction,
};
export {
  authenticatePasskey,
  passkeyAuthenticationOptions,
  passkeyRegistrationOptions,
  registerPasskey,
  setLocaleAction,
};
