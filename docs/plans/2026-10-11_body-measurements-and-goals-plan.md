# Body Measurements and Goals Plan

## Goal

Track body weight and waist measurements with trends and a target-weight line.

## Context

- `prisma/schema.prisma` has no body-measurement or body-goal models.
- References: `/Users/narumi/src/SparkyFitness/SparkyFitnessFrontend/src/pages/Reports/MeasurementChartsGrid.tsx`, `pages/Goals/GoalWeight.tsx`, and wger's `wger/measurements/` implementation.

## Architecture

- Add a user-owned daily measurement record with optional weight in kg and waist in cm; require at least one value and enforce one record per user/date.
- Add one nullable target weight per user. Use metric units explicitly in labels; do not add general unit preferences in this scope.
- Server validation rejects nonfinite or nonpositive values and sets documented finite limits before migration.
- Keep measurement dates consistent with workout date keys. Daily edits update the same record after explicit save.
- Add `src/app/measurements/page.tsx`, focused actions, and a server query/helper module.
- Show independent weight and waist charts plus an accessible data table. Overlay the target only on the weight chart.
- Never expose another user's measurements, including to administrators through this feature.

## Non-Goals

Progress photos, body-fat estimates, medical interpretation, predictions, wearable sync, and nutrition tracking.

## Implementation Rules

- Keep Next.js App Router, TypeScript, Prisma, SQLite, Zod, and Biome.
- Use Radix UI for new interactions where applicable; verify installed packages before adding only the packages needed.
- Put authentication and database writes on the server; derive user identity from `requireUser()`.
- Add English UI strings through `src/lib/i18n.ts`.
- Reference repositories are read-only; inspect relevant code and license terms before adapting anything.
- No test script currently exists. Use Node's test runner with the installed `tsx` loader for pure TypeScript tests; add a focused test command and document it. Keep database tests on a disposable SQLite database.
- Follow root `AGENTS.md`; do not edit generated Prisma files or commit local databases.

## Plan

- [ ] Verify navigation, date handling, and reference measurement flows; record input bounds and same-day update behavior.
- [ ] Add models and a named migration; fixtures preserve workouts and demonstrate per-user daily uniqueness and user-deletion behavior.
- [ ] Add Zod schemas and authenticated create/update/delete and target actions; tests cover blank fields, one valid metric, invalid numbers, duplicate dates, and foreign record IDs.
- [ ] Add the measurement page and navigation entry with dictionary strings; browser checks prove log, edit, delete, and clear-goal flows.
- [ ] Add sorted trend data, target line, and accessible table; fixtures and browser checks cover gaps, single records, empty ranges, and independent measurement scales.
- [ ] Test two users with overlapping dates; reads and writes remain isolated.
- [ ] Verify invalid drafts and failed saves remain visible without changing confirmed data.
- [ ] Test backup restoration and record migration evidence.

## Rollback / Recovery

- Before applying the migration to an existing database, stop writes and make a SQLite backup with a verified restore on a disposable database.
- Test the migration on an empty database and a copy of existing data; compare record counts and preserved field values.
- Do not use `db:push`, database resets, or destructive down migrations as recovery.
- Keep additive measurement data on application rollback and remove only the new UI routes if necessary. Correct invalid measurements through owner-checked edits rather than dropping tables.
- Before release, document the tested recovery procedure. A full backup restore discards later writes and needs explicit approval.

## Completion Checklist

- [ ] Feature tests pass with the exact command and results recorded in this plan.
- [ ] `npm run check` and `npm run build` pass.
- [ ] Browser smoke tests pass at `http://localhost:8783`, including the feature workflow, empty state, and keyboard interaction; stop the dev server afterward.
- [ ] Weight and waist labels show units; target line and missing values do not create fabricated measurements.
- [ ] Review the diff for user isolation, English dictionary strings, generated artifacts, and unrelated changes.
- [ ] If committing, run `prek run -a` and stage only intended paths; otherwise record that no commit was requested.
- [ ] Record verification results and any accepted limits in the handoff; delete this plan only after every task and completion check passes.
