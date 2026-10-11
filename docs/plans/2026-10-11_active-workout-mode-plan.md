# Active Workout Mode Plan

## Goal

Support reliable start, pause, resume, and finish workflows with completed sets and a rest timer.

## Context

- `Workout` and `WorkoutSet` in `prisma/schema.prisma` have no execution state.
- Template creation and duplication in `src/app/actions/workouts.ts` currently copy values as recorded sets.
- `src/lib/stats.ts`, exercise history, and calendar queries currently count all saved records.
- Reference: `/Users/narumi/src/openGym/frontend/src/views/Workout.jsx`, `frontend/src/lib/session-start.js`, and `frontend/src/lib/supersetFlow.js`.

## Architecture

- Dependency: complete `2026-10-11_set-types-and-rir-plan.md` first.
- Add workout states ACTIVE, PAUSED, COMPLETED, and ABANDONED, with server timestamps and accumulated active duration.
- Add set completion and separate planned weight/reps from actual weight/reps. Snapshot targets when the session starts; later template edits must not change them.
- Preserve ordinary retrospective logging as completed records. Starting from a template or repeated workout creates uncompleted planned sets.
- Keep existing rows completed after migration; do not infer execution state from dates.
- Persist set edits and state changes through owner-checked server actions. Failed writes remain visibly unsaved.
- Store the rest deadline in SQLite. Use a wall-clock deadline for display, not a decrement-only counter; pause clears the rest timer.
- Use an explicit rest duration at session start with a documented default; do not add profile settings or notifications.
- Count completed sets in completed workouts for training reports, PRs, history suggestions, and consistency. Exclude active, paused, abandoned, and uncompleted planned work.
- Allow finishing with skipped sets after explicit confirmation; skipped sets remain uncompleted. Reopening a completed session is out of scope.

## Non-Goals

Offline synchronization, device notifications, automatic progression, native apps, and guaranteed background sound.

## Implementation Rules

- Keep Next.js App Router, TypeScript, Prisma, SQLite, Zod, and Biome.
- Use Radix UI for new interactions where applicable; verify installed packages before adding only the packages needed.
- Put authentication and database writes on the server; derive user identity from `requireUser()`.
- Add English UI strings through `src/lib/i18n.ts`.
- Reference repositories are read-only; inspect relevant code and license terms before adapting anything.
- No test script currently exists. Use Node's test runner with the installed `tsx` loader for pure TypeScript tests; add a focused test command and document it. Keep database tests on a disposable SQLite database.
- Follow root `AGENTS.md`; do not edit generated Prisma files or commit local databases.

## Plan

- [ ] Map all workout readers and write paths, including templates, duplication, import, dashboard, history, stats, and calendar; record which remain retrospective versus active.
- [ ] Define the state-transition table, finish confirmation, timer behavior, and retry semantics; fixture tests cover invalid transitions and repeat requests.
- [ ] Add the schema and named migration with preserved legacy completion; migration fixtures prove previous reports are unchanged.
- [ ] Add owner-checked start, pause, resume, finish, abandon, edit, and set-completion actions; integration tests prove retries cannot duplicate sessions and foreign IDs cannot mutate data.
- [ ] Add active session controls and completed-set UI to the workout page; browser tests prove each transition and explicit partial finish.
- [ ] Add deadline-based rest display and duration tracking; reload, navigation, pause, and failed-save tests show recoverable state without lost confirmed sets.
- [ ] Update every reader and copy path from the inventory; fixtures prove planned values never create volume, PRs, prior-session values, or training streaks.
- [ ] Preserve historical logging, correction, template saving, and duplication; regression tests distinguish copied targets from performed sets.
- [ ] Test two-tab stale updates and rapid repeated completion clicks; reject conflicts or refresh state rather than silently losing confirmed changes.
- [ ] Test migration and restore on disposable databases; record the recovery outcome.

## Rollback / Recovery

- Before applying the migration to an existing database, stop writes and make a SQLite backup with a verified restore on a disposable database.
- Test the migration on an empty database and a copy of existing data; compare record counts and preserved field values.
- Do not use `db:push`, database resets, or destructive down migrations as recovery.
- Keep additive state columns on application rollback only if the old app cannot treat planned rows as performed work; otherwise stop writes and roll forward with a fix.
- Before release, document the tested recovery procedure. A full backup restore discards later writes and needs explicit approval.

## Completion Checklist

- [ ] Feature tests pass with the exact command and results recorded in this plan.
- [ ] `npm run check` and `npm run build` pass.
- [ ] Browser smoke tests pass at `http://localhost:8783`, including the feature workflow, empty state, and keyboard interaction; stop the dev server afterward.
- [ ] Migration fixtures preserve legacy counts, weights, reps, and records; incomplete work is absent from all reports.
- [ ] Review the diff for user isolation, English dictionary strings, generated artifacts, and unrelated changes.
- [ ] If committing, run `prek run -a` and stage only intended paths; otherwise record that no commit was requested.
- [ ] Record verification results and any accepted limits in the handoff; delete this plan only after every task and completion check passes.
