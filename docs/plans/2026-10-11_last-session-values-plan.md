# Last-Session Values Plan

## Goal

Reduce set-entry work by showing and copying the user's previous exercise values.

## Context

- `src/app/workouts/[id]/page.tsx` loads the current workout and exercise list, but does not show prior values in the entry form.
- `src/app/exercises/[id]/page.tsx` provides history; `src/app/actions/workouts.ts` already duplicates entire workouts.
- Reference: `/Users/narumi/src/openGym/frontend/src/views/Workout.jsx` and `frontend/src/lib/session-start.js`.

## Architecture

- Add a server-only prior-session query helper, preferably `src/lib/workout-history.ts`, and a small client component for explicit copy actions.
- Select the latest workout strictly before the target workout's calendar date, restricted to the signed-in user and exercise; exclude the current workout.
- Resolve ties by date, creation time, and ID. Preserve source set order.
- Copy only weight and reps into editable fields; do not save until the user submits. Never overwrite a draft without an explicit copy action.
- After active workout mode exists, use completed sets only. Initial implementation uses the current recorded-set model.

## Non-Goals

Automatic progression, copying notes, copying entire sessions, and a schema migration.

## Implementation Rules

- Keep Next.js App Router, TypeScript, Prisma, SQLite, Zod, and Biome.
- Use Radix UI for new interactions where applicable; verify installed packages before adding only the packages needed.
- Put authentication and database writes on the server; derive user identity from `requireUser()`.
- Add English UI strings through `src/lib/i18n.ts`.
- Reference repositories are read-only; inspect relevant code and license terms before adapting anything.
- No test script currently exists. Use Node's test runner with the installed `tsx` loader for pure TypeScript tests; add a focused test command and document it. Keep database tests on a disposable SQLite database.
- Follow root `AGENTS.md`; do not edit generated Prisma files or commit local databases.

## Plan

- [ ] Verify date storage and history ordering in the current actions; document a date-boundary contract with backdated and same-day examples.
- [ ] Add the prior-session helper with batched reads for displayed exercises; fixture tests prove no future, same-day, current-workout, or other-user values appear.
- [ ] Add an inline previous-session summary and copy action to the workout entry UI; browser evidence shows source date, ordered values, editable copies, and no-history state.
- [ ] Integrate exercise selection and draft handling; switching exercise cannot display stale history or replace manually entered values silently.
- [ ] Test corrected and deleted history, duplicate-date ties, and several exercises; source changes appear on the next query without changing saved workouts.
- [ ] Verify current workout duplication and template creation remain unchanged.

## Completion Checklist

- [ ] Feature tests pass with the exact command and results recorded in this plan.
- [ ] `npm run check` and `npm run build` pass.
- [ ] Browser smoke tests pass at `http://localhost:8783`, including the feature workflow, empty state, and keyboard interaction; stop the dev server afterward.
- [ ] Review the diff for user isolation, English dictionary strings, generated artifacts, and unrelated changes.
- [ ] If committing, run `prek run -a` and stage only intended paths; otherwise record that no commit was requested.
- [ ] Record verification results and any accepted limits in the handoff; delete this plan only after every task and completion check passes.
