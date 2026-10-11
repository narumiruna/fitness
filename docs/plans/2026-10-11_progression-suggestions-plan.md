# Progression Suggestions Plan

## Goal

Suggest the next training weight from completed working sets with an explicit reason and user confirmation.

## Context

- Existing templates contain fixed set values; `WorkoutSet` has no target-versus-actual distinction.
- Reference: `/Users/narumi/src/openGym/frontend/src/lib/progression.js` and `/Users/narumi/src/wger/wger/manager/models/abstract_config.py`.

## Architecture

- Dependencies: complete the set-types/RIR and active-workout plans. Last-session values provide the display integration.
- Implement one opt-in linear progression rule per template exercise: all prescribed working sets meet their snapshot rep targets at the prescribed weight, then suggest one positive weight increment.
- Store the increment and opt-in rule on the template exercise configuration; no automatic rule applies to unconfigured exercises.
- Keep historical snapshots immutable. Derive a suggestion from the latest qualifying earlier session linked to that template and exercise.
- Skipped sets, missed reps, inconsistent loads, changed targets, abandoned sessions, or missing target history do not justify an increase.
- Display the source session, target, increment, and reason. Explicit acceptance changes only the new session's target, never recorded history.
- Resolve the current weight-unit convention before enabling increments. Do not interpret ambiguous historical units silently.
- Edited history changes future suggestions; applying an old displayed suggestion must revalidate its source on the server.

## Non-Goals

Deload automation, double/triple progression, AI coaching, RIR-based prescriptions, and plate inventory.

## Implementation Rules

- Keep Next.js App Router, TypeScript, Prisma, SQLite, Zod, and Biome.
- Use Radix UI for new interactions where applicable; verify installed packages before adding only the packages needed.
- Put authentication and database writes on the server; derive user identity from `requireUser()`.
- Add English UI strings through `src/lib/i18n.ts`.
- Reference repositories are read-only; inspect relevant code and license terms before adapting anything.
- No test script currently exists. Use Node's test runner with the installed `tsx` loader for pure TypeScript tests; add a focused test command and document it. Keep database tests on a disposable SQLite database.
- Follow root `AGENTS.md`; do not edit generated Prisma files or commit local databases.

## Plan

- [ ] Verify template lineage, target snapshots, and weight-unit meaning after prerequisite plans; record how changed templates invalidate earlier comparison targets.
- [ ] Add the smallest template-exercise rule storage and a named migration; defaults disable suggestions and preserve all existing templates.
- [ ] Implement a pure rule evaluator with explicit reason codes; tests cover success, misses, skipped work, warm-ups, changed targets, manual load changes, empty history, and increments with decimals.
- [ ] Query user-owned, earlier completed sessions for the matching template/exercise; tests reject future dates, foreign sessions, and unrelated routines.
- [ ] Add opt-in rule controls and a suggestion preview to the workout flow; browser checks prove default-off behavior and readable reasons.
- [ ] Add explicit accept/reject actions with source revalidation; tests prove no history mutation, no silent acceptance, and safe repeat requests.
- [ ] Correct or delete a source workout and retry acceptance; tests prove stale suggestions cannot be applied as if their evidence were still valid.
- [ ] Test backup restoration and record migration evidence.

## Rollback / Recovery

- Before applying the migration to an existing database, stop writes and make a SQLite backup with a verified restore on a disposable database.
- Test the migration on an empty database and a copy of existing data; compare record counts and preserved field values.
- Do not use `db:push`, database resets, or destructive down migrations as recovery.
- Leave additive rule storage in place on application rollback. Disable use by reverting the UI and evaluator; retain rules and immutable targets for a forward fix.
- Before release, document the tested recovery procedure. A full backup restore discards later writes and needs explicit approval.

## Completion Checklist

- [ ] Feature tests pass with the exact command and results recorded in this plan.
- [ ] `npm run check` and `npm run build` pass.
- [ ] Browser smoke tests pass at `http://localhost:8783`, including the feature workflow, empty state, and keyboard interaction; stop the dev server afterward.
- [ ] No automatic increase occurs for missed, unfinished, inconsistent, or unverifiable targets; every accepted change is explicit.
- [ ] Review the diff for user isolation, English dictionary strings, generated artifacts, and unrelated changes.
- [ ] If committing, run `prek run -a` and stage only intended paths; otherwise record that no commit was requested.
- [ ] Record verification results and any accepted limits in the handoff; delete this plan only after every task and completion check passes.
