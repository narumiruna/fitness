import { cookies } from "next/headers";

export const defaultLocale = "en";
export const supportedLocales = ["en", "zh-TW"] as const;

export type Locale = (typeof supportedLocales)[number];

const enMessages = {
  appName: "Fitness",
  dashboard: "Dashboard",
  workouts: "Workouts",
  workout: "Workout",
  calendar: "Calendar",
  stats: "Stats",
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
  previous: "Previous",
  next: "Next",
  today: "Today",
  weekdaySun: "Sun",
  weekdayMon: "Mon",
  weekdayTue: "Tue",
  weekdayWed: "Wed",
  weekdayThu: "Thu",
  weekdayFri: "Fri",
  weekdaySat: "Sat",
  set: "set",
  sets: "sets",
  notesAvailable: "Notes",
  more: "more",
  addSet: "Add set",
  noSets: "No sets yet.",
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
  clearSearch: "Clear",
  actions: "Actions",
  exercisePageIntro: "Find, create, and maintain exercise names and aliases.",
  exerciseLibrary: "Exercise library",
  exerciseLibraryIntro:
    "Sorted by default name. Use search to filter aliases and translated names.",
  exerciseResults: "Search results",
  noExerciseResults: "No exercises match this search.",
  noExerciseResultsHint: "Try another name or create a new exercise.",
  totalExercises: "Total exercises",
  usedExercises: "Used exercises",
  results: "Results",
  showing: "Showing",
  noAliases: "No aliases yet.",
  newExercise: "New",
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
  statsIntro: "Strength trends from your logged sets.",
  noStats: "Log workouts and sets to see stats.",
  overview: "Overview",
  recentActivity: "Recent activity",
  recentActivityIntro: "Last 30 days compared with the prior 30 days.",
  current30Days: "Current 30 days",
  previous30Days: "Previous 30 days",
  current: "Current",
  previousPeriod: "Previous",
  change: "Change",
  monthlyTrend: "Monthly trend",
  monthlyTrendIntro: "Volume over the last 6 months.",
  topExercises: "Top exercises",
  topExercisesIntro: "Ranked by total volume.",
  personalRecords: "Personal records",
  personalRecordsIntro: "Best logged set per exercise.",
  totalWorkouts: "Total workouts",
  trainingDays: "Training days",
  totalSets: "Total sets",
  setsMetric: "Sets",
  totalReps: "Total reps",
  totalVolume: "Total volume",
  averageVolumePerWorkout: "Avg volume / workout",
  metric: "Metric",
  volume: "Volume",
  maxWeight: "Max weight",
  maxReps: "Max reps",
  bestVolumeSet: "Best volume set",
  estimatedOneRepMax: "Estimated 1RM",
  month: "Month",
  monthWorkouts: "This month",
  noMonthWorkouts: "No workouts this month.",
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
