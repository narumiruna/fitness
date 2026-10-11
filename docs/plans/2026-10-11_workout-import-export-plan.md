# Workout Import and Export Plan

## Goal

Export the signed-in user's saved workouts and safely import CSV with preview, exercise matching, and duplicate detection.

## Context

- `scripts/export-workouts-csv.ts` exports local Markdown, not database workouts.
- `scripts/import-workouts-csv.ts` selects the first user and deletes that user's workouts on matching dates before replacement.
- This script must not be reused as a web import action.
- Reference: `/Users/narumi/src/openGym/frontend/src/lib/import-csv.js`.

## Architecture

- Add an authenticated export route and a data-transfer page. Use server-derived user identity, never a user ID supplied in the file.
- Begin with one versioned app CSV format, not Strong/Hevy adapters. Keep existing local script formats working.
- Preserve separate same-day workouts with an export workout key; include ordered sets, dates, titles, workout/set notes, exercise names, type, and actual RIR when available.
- If active mode exists, export completion state and target snapshots explicitly. Import preserves those distinctions without starting a live timer.
- Protect spreadsheet text fields from formula execution with documented reversible encoding.
- Preview parses and validates without writes. Show counts, row errors, unknown exercises, and duplicate candidates.
- Match existing names and aliases; require explicit mapping or creation for unknown exercises. Never change shared aliases silently.
- Confirmation revalidates the same file and mappings on the server, then imports atomically.
- Default behavior skips duplicates without overwriting existing workouts. Use a user-scoped canonical content fingerprint per workout, not date alone; record accepted imports for retry protection.
- Limit uploads to 5 MiB and 20,000 CSV rows, with a clear validation error.
- Keep import bookkeeping limited to workout batches and fingerprints required for safety; no background jobs.

## Non-Goals

External API imports, wearable sync, automatic date-based replacement, full account backup, and changing local data files.

## Implementation Rules

- Keep Next.js App Router, TypeScript, Prisma, SQLite, Zod, and Biome.
- Use Radix UI for new interactions where applicable; verify installed packages before adding only the packages needed.
- Put authentication and database writes on the server; derive user identity from `requireUser()`.
- Add English UI strings through `src/lib/i18n.ts`.
- Reference repositories are read-only; inspect relevant code and license terms before adapting anything.
- No test script currently exists. Use Node's test runner with the installed `tsx` loader for pure TypeScript tests; add a focused test command and document it. Keep database tests on a disposable SQLite database.
- Follow root `AGENTS.md`; do not edit generated Prisma files or commit local databases.

## Plan

- [ ] Specify the versioned CSV contract, optional fields, status compatibility, duplicate fingerprint, and formula-safe round trip; fixtures include multiple workouts on one date.
- [ ] Add pure bounded parsing and serialization helpers without changing local script semantics; tests cover commas, quoted newlines, BOM, Unicode, formula text, malformed numbers, and upload/row limits.
- [ ] Add the minimum import-batch/fingerprint storage and named migration if required; fixtures preserve existing workouts and isolate fingerprints by user.
- [ ] Add authenticated database export and download UI; integration tests prove only the signed-in user's records appear and no password/session data is exported.
- [ ] Add read-only preview and explicit exercise mapping; tests prove preview performs no writes and foreign exercise permissions cannot be bypassed.
- [ ] Add transactional confirmation with duplicate skipping and repeat-request protection; tests prove no deletions, no overwrites, and no partial imports on validation or database failure.
- [ ] Revalidate preview inputs at confirmation; changed files, mappings, or duplicate state cannot bypass validation.
- [ ] Add browser coverage for export, preview, map, confirm, cancel, duplicates, and errors; user sees exact imported/skipped counts.
- [ ] Verify export/import round trips preserve dates, separate sessions, ordering, notes, and supported set/state fields; legacy scripts still parse their existing fixtures.
- [ ] Test backup restoration and batch-specific recovery using disposable databases; record exactly which rows an import created.

## Rollback / Recovery

- Before applying the migration to an existing database, stop writes and make a SQLite backup with a verified restore on a disposable database.
- Test the migration on an empty database and a copy of existing data; compare record counts and preserved field values.
- Do not use `db:push`, database resets, or destructive down migrations as recovery.
- Keep a database backup before import. Store batch ownership and created-workout links so an explicitly approved recovery can remove only that batch's new, unmodified workouts; edited rows require review. Never remove workouts merely because dates match.
- Before release, document the tested recovery procedure. A full backup restore discards later writes and needs explicit approval.

## Completion Checklist

- [ ] Feature tests pass with the exact command and results recorded in this plan.
- [ ] `npm run check` and `npm run build` pass.
- [ ] Browser smoke tests pass at `http://localhost:8783`, including the feature workflow, empty state, and keyboard interaction; stop the dev server afterward.
- [ ] Preview writes nothing; repeated confirmation and duplicate files create no duplicate workouts or destructive replacements.
- [ ] Export/import round-trip and spreadsheet-safety fixtures pass with the documented encoding.
- [ ] Review the diff for user isolation, English dictionary strings, generated artifacts, and unrelated changes.
- [ ] If committing, run `prek run -a` and stage only intended paths; otherwise record that no commit was requested.
- [ ] Record verification results and any accepted limits in the handoff; delete this plan only after every task and completion check passes.
