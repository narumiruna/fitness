# Exercise Tags and Muscle Reports Plan

## Goal

Filter exercises by muscle and equipment and report weekly working sets by muscle.

## Context

- `Exercise` stores names and aliases but no muscle or equipment metadata.
- `src/app/exercises/page.tsx` and `src/app/exercises/[id]/page.tsx` provide catalogue and history pages.
- References: `/Users/narumi/src/wger/wger/exercises/models/base.py` and openGym's `frontend/src/lib/muscles.js`.

## Architecture

- Dependency for reports: complete `2026-10-11_set-types-and-rir-plan.md`.
- Add small controlled muscle and equipment catalogues with explicit relations to exercises; support primary and secondary muscles.
- Existing exercises remain untagged until reviewed. Do not bulk-copy reference data or media.
- Exercises are shared records. Limit editing of shared metadata to administrators; ordinary users can edit metadata only for exercises they created. Enforce this on the server.
- Show primary-muscle set totals and secondary-muscle involvement separately. One compound set may appear in several muscle rows; do not sum rows as a whole-body set total.
- Untagged exercises appear in an Unknown group. Warm-ups do not count as working sets; active mode later adds its completed-work filter.
- Use the existing Sunday-start weekly date convention.

## Non-Goals

Body diagrams, muscle recovery estimates, automatic exercise classification, and media import.

## Implementation Rules

- Keep Next.js App Router, TypeScript, Prisma, SQLite, Zod, and Biome.
- Use Radix UI for new interactions where applicable; verify installed packages before adding only the packages needed.
- Put authentication and database writes on the server; derive user identity from `requireUser()`.
- Add English UI strings through `src/lib/i18n.ts`.
- Reference repositories are read-only; inspect relevant code and license terms before adapting anything.
- No test script currently exists. Use Node's test runner with the installed `tsx` loader for pure TypeScript tests; add a focused test command and document it. Keep database tests on a disposable SQLite database.
- Follow root `AGENTS.md`; do not edit generated Prisma files or commit local databases.

## Plan

- [ ] Verify exercise creation and edit permissions and reference taxonomy licenses; document a small original catalogue and shared-record ownership policy.
- [ ] Add relations and a named migration without renaming exercises or aliases; fixtures preserve existing IDs and leave metadata empty.
- [ ] Add validated owner/admin metadata actions; integration tests reject foreign-user edits, duplicate tags, and invalid catalogue IDs.
- [ ] Add metadata controls and catalogue filters; browser checks prove combined filters, clear filters, keyboard access, and untagged entries.
- [ ] Add working-set aggregation and a weekly table to stats; fixtures cover compound exercises, secondary involvement, Unknown entries, and week boundaries.
- [ ] Verify metadata corrections recompute reports without changing workout values; other users' workout counts remain inaccessible.
- [ ] Confirm dictionary coverage and small-screen usability without a custom body-map asset.
- [ ] Test backup restoration and record migration evidence.

## Rollback / Recovery

- Before applying the migration to an existing database, stop writes and make a SQLite backup with a verified restore on a disposable database.
- Test the migration on an empty database and a copy of existing data; compare record counts and preserved field values.
- Do not use `db:push`, database resets, or destructive down migrations as recovery.
- Retain additive catalogue and relation tables on application rollback. Existing workout and alias data must remain untouched; prefer forward fixes for metadata mistakes.
- Before release, document the tested recovery procedure. A full backup restore discards later writes and needs explicit approval.

## Completion Checklist

- [ ] Feature tests pass with the exact command and results recorded in this plan.
- [ ] `npm run check` and `npm run build` pass.
- [ ] Browser smoke tests pass at `http://localhost:8783`, including the feature workflow, empty state, and keyboard interaction; stop the dev server afterward.
- [ ] Permission tests pass and muscle rows cannot be mistaken for additive whole-body totals or measured recovery.
- [ ] Review the diff for user isolation, English dictionary strings, generated artifacts, and unrelated changes.
- [ ] If committing, run `prek run -a` and stage only intended paths; otherwise record that no commit was requested.
- [ ] Record verification results and any accepted limits in the handoff; delete this plan only after every task and completion check passes.
