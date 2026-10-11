# Dashboard UI

## Structure

- Workouts: month-grouped history, filters, real totals, exercise previews, creation, and templates. Keep 20-row pagination and existing title/notes search semantics.
- Calendar: Sunday-first, 42-cell month grid, local-date selection, all selected-day workouts, selected-date creation, and month agenda. On narrow screens, show the selected date before the agenda. Small workout markers retain accessible names and detail links.
- Stats: URL-based ranges, six supported metrics, daily volume, Sunday-start weekly counts, exercise distribution, exercise volume, and personal records. Expand detailed totals, records, and period comparisons when needed.
- Exercises: shared library, name/localized-name/normalized-alias search, name sorting, personal recent-use sorting, aliases, creation, and personal recent-use dates. Usage counts and dates exclude other users' workouts.

Shared components live in `src/components/`: page headers and metrics in `dashboard.tsx`, active navigation, submit status, delete confirmation, error fallback, and training charts. Authentication, queries, validation, and mutations remain server-side.

## Design tokens

`src/app/globals.css` defines neutral background `#f7f8f7`, white surfaces, teal accent `#0f766e`, text `#17212b`, muted text `#52637a`, and border `#e2e8e5`. Surfaces use approximately 12px corners; controls use 8px corners. Content is centered with narrow secondary panels. Primary navigation marks active and nested routes with `aria-current`.

English strings remain available through `src/lib/i18n.ts`. The pure dictionary in `src/lib/messages.ts` also supplies client error boundaries without importing server-only cookie APIs. Existing locale fallback behavior is unchanged.

## Data rules and reference adaptations

- Volume is the sum of recorded weight multiplied by repetitions. Stored weights have no unit field; do not label them as kilograms or pounds.
- All-time stats preserve all recorded dates, including future-dated records. The 30-, 90-, and 180-day ranges include local calendar days through today. Range-scoped records use the selected interval; all-time records are labeled separately.
- Daily volume combines same-day sessions. Weekly counts include empty weeks and count recorded workouts, not completed or scheduled sessions.
- Distribution counts sets by exercise. Six named groups plus Other include every selected set exactly once. Exercise volume and detailed leader tables retain the existing top-eight limit.
- Records retain maximum weight, maximum repetitions, best set volume, and estimated 1RM (`weight × (1 + reps / 30)`), with source dates and set details. The compact record list shows maximum weight; expand Details for all four measures.
- Recent activity remains the fixed current/prior 30-day comparison. The six-month trend remains labeled separately and uses selected-range records.
- Do not invent duration, streaks, muscle groups, equipment, categories, favorites, scheduling, or completion status. The model does not store these fields.
- Creation forms remain visible secondary sections, not modal workflows. Delete confirmation is reserved for destructive actions.
- No migration, dependency, auth contract, or developer database change is required. SQLite persistence and all existing server action inputs remain unchanged.

## Verification

Run from the repository root:

| Command | Result |
| --- | --- |
| `npm run check` | Biome and TypeScript pass |
| `npm run test:dashboard` | 5 calculation/date tests pass |
| `npm run test:db-init` | 6 database initialization tests pass |
| `npm run test:ui` | 5 development browser tests pass |
| `npm run test:ui:production` | Production build and 5 browser tests pass |
| `prek run -a` | Biome and TypeScript pass before commit |

Browser tests use disposable SQLite records on port `8783` and stop the server afterward. They cover existing auth, account, administration, workout, set, template, alias, filtering, and pagination workflows. Additional checks cover repeated notes-checkbox form-value changes, active nested routes, selected-date creation, range scope, user isolation, keyboard chart values, delete cancellation/confirmation, pending buttons, duplicate submissions, failure recovery with Next.js `retry`, axe, reduced motion, focus, and horizontal overflow.

The recovery test deliberately submits an alias with a missing exercise ID. Its expected `P2003` server log is not a regression; the test verifies the fallback, unchanged alias count, and successful retry.

## Visual review

All four pages were reviewed with empty and populated records at 1440px, 768px, and 390px: 24 captures. Review fixed oversized rows and tables, excessive calendar height, missing narrow-screen markers, muted-text contrast, and chart hydration differences. Sparse and setless calculations are covered separately; empty pages do not display fabricated charts or redundant metrics.

Captures are local test artifacts, not committed application assets:

- Empty: `test-results/ui-setup-login-failures-pa-3059d-ion-and-session-replacement/empty-{page}-{width}.png`
- Populated: `test-results/ui-dashboard-ranges-calend-a54d1-irmations-and-visual-review/populated-{page}-{width}.png`
- `page`: workouts, calendar, stats, exercises. `width`: 1440, 768, 390.

Run either browser suite to recreate these captures. Accepted differences from the references are Sunday-first dates, six supported stats metrics, exercise-based summaries, preserved creation forms, and no unsupported domain controls. Recovery is a focused code revert; do not reset or seed the developer database.
