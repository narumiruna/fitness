# Template Scheduling Plan

## Goal

Assign workout templates to weekdays and compare planned sessions with completed training.

## Context

- `WorkoutTemplate` is user-owned; `Workout` currently has no template lineage.
- `src/app/calendar/page.tsx` displays saved workouts only.
- References: `/Users/narumi/src/openGym/frontend/src/views/Plan.jsx`, `frontend/src/lib/rotation.js`, and wger's `wger/manager/models/routine.py`.

## Architecture

- Dependency: complete active workout mode for reliable completed-session matching.
- Add at most one template assignment per user/weekday; retain the existing Sunday-first calendar.
- A weekly assignment is a definition, not a pre-created workout. Render planned occurrences from assignments and their effective date.
- Store template lineage and the planned date when a scheduled session starts. Keep a title snapshot so later template edits cannot rename history.
- Repeated start requests return the same linked session for an occurrence; unrelated manual workouts do not complete its plan.
- Editing an assignment applies to future occurrences only; preserve dated occurrences already started and completed. Document exact effective-date behavior before migration.
- Deleting a template removes future assignments but preserves historical workouts and snapshots.
- Show Planned, In progress, Completed, and Missed labels; a past occurrence without a completed linked workout is missed.

## Non-Goals

Rotation schedules, multiple daily assignments, reminders, rescheduling, starter plans, and recurrence beyond weekdays.

## Implementation Rules

- Keep Next.js App Router, TypeScript, Prisma, SQLite, Zod, and Biome.
- Use Radix UI for new interactions where applicable; verify installed packages before adding only the packages needed.
- Put authentication and database writes on the server; derive user identity from `requireUser()`.
- Add English UI strings through `src/lib/i18n.ts`.
- Reference repositories are read-only; inspect relevant code and license terms before adapting anything.
- No test script currently exists. Use Node's test runner with the installed `tsx` loader for pure TypeScript tests; add a focused test command and document it. Keep database tests on a disposable SQLite database.
- Follow root `AGENTS.md`; do not edit generated Prisma files or commit local databases.

## Plan

- [ ] Define effective dates, past-calendar display, partial sessions, deletion behavior, and idempotent start matching; fixture examples resolve historical-plan ambiguity.
- [ ] Add assignment and occurrence-link storage with a named migration; legacy workouts remain unlinked and unchanged.
- [ ] Add owner-checked assignment create/update/remove actions; tests enforce one assignment per weekday and reject foreign templates.
- [ ] Add weekday assignment controls using existing templates; browser checks prove creation, replacement, removal, and no-template state.
- [ ] Extend calendar queries and rendering with generated occurrences and status labels; fixtures cover week/year boundaries, missed days, and future dates.
- [ ] Add start-from-occurrence behavior with atomic duplicate protection; retries and two-tab tests create one linked session.
- [ ] Test later assignment changes and template deletion; previous completed occurrences, titles, and workout values remain intact.
- [ ] Verify manual workouts and abandoned or unfinished sessions cannot falsely satisfy scheduled completion.
- [ ] Test backup restoration and record migration evidence.

## Rollback / Recovery

- Before applying the migration to an existing database, stop writes and make a SQLite backup with a verified restore on a disposable database.
- Test the migration on an empty database and a copy of existing data; compare record counts and preserved field values.
- Do not use `db:push`, database resets, or destructive down migrations as recovery.
- Preserve occurrence links and snapshots on application rollback. Remove scheduling writes first; do not delete historical workouts to remove a plan.
- Before release, document the tested recovery procedure. A full backup restore discards later writes and needs explicit approval.

## Completion Checklist

- [ ] Feature tests pass with the exact command and results recorded in this plan.
- [ ] `npm run check` and `npm run build` pass.
- [ ] Browser smoke tests pass at `http://localhost:8783`, including the feature workflow, empty state, and keyboard interaction; stop the dev server afterward.
- [ ] Calendar fixtures prove historical schedule changes do not rewrite completed training and retries do not create duplicate sessions.
- [ ] Review the diff for user isolation, English dictionary strings, generated artifacts, and unrelated changes.
- [ ] If committing, run `prek run -a` and stage only intended paths; otherwise record that no commit was requested.
- [ ] Record verification results and any accepted limits in the handoff; delete this plan only after every task and completion check passes.
