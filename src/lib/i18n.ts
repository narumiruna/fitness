import { cookies } from "next/headers";

export const defaultLocale = "en";
export const supportedLocales = ["en", "zh-TW"] as const;

export type Locale = (typeof supportedLocales)[number];

const enMessages = {
  appName: "Fitness",
  dashboard: "Dashboard",
  workouts: "Workouts",
  exercises: "Exercises",
  admin: "Admin",
  account: "Account",
  signOut: "Sign out",
  signIn: "Sign in",
  username: "Username",
  password: "Password",
  loginTitle: "Sign in",
  loginError: "Invalid username or password.",
  setupTitle: "Create the first admin account",
  setupIntro: "No users exist yet. Create the first administrator to start.",
  createAdmin: "Create admin",
  workoutTitle: "Title",
  date: "Date",
  notes: "Notes",
  createWorkout: "Create workout",
  noWorkouts: "No workouts yet.",
  view: "View",
  addSet: "Add set",
  exercise: "Exercise",
  weight: "Weight",
  reps: "Reps",
  order: "Order",
  save: "Save",
  delete: "Delete",
  createExercise: "Create exercise",
  defaultName: "Default name",
  aliases: "Aliases",
  locale: "Locale",
  alias: "Alias",
  addAlias: "Add alias",
  searchExercises: "Search exercises",
  search: "Search",
  users: "Users",
  createUser: "Create user",
  role: "Role",
  sourceLicense: "Source and license",
  sourceLicenseBody:
    "This application is licensed under AGPL-3.0-only. See the repository and LICENSE file for source terms.",
  changePassword: "Change password",
  currentPassword: "Current password",
  newPassword: "New password",
  confirmPassword: "Confirm password",
  passwordChanged: "Password changed.",
  changePasswordError: "Check the current password and new password.",
} as const;

const messages: Record<Locale, Partial<typeof enMessages>> = {
  en: enMessages,
  "zh-TW": {
    appName: "Fitness",
  },
};

export type MessageKey = keyof typeof enMessages;

export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const locale = cookieStore.get("locale")?.value;

  if (isSupportedLocale(locale)) {
    return locale;
  }

  return defaultLocale;
}

export async function getDictionary() {
  const locale = await getLocale();

  return function t(key: MessageKey) {
    return messages[locale][key] ?? enMessages[key];
  };
}

function isSupportedLocale(value: string | undefined): value is Locale {
  return supportedLocales.some((locale) => locale === value);
}
