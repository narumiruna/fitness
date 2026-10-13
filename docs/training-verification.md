# Training roadmap delivery evidence

Reverified: 2026-10-13. Base: `origin/main` at `1bd8751`. Branch: `narumi/test/roadmap-delivery-verification`.

The nine features were already merged in #8, with corrections in #10 and #16. This follow-up verifies the current implementation and repairs the production browser harness; it does not implement the features again.

## Current verification

| Command | Result |
| --- | --- |
| `npm run test:training` | 15 passed |
| `npm run test:training:sqlite` | 14 passed; legacy/empty upgrades and backup restoration passed |
| `npm run test:training:postgres` | 14 passed; legacy/empty upgrades and backup restoration passed |
| `npm run test:db-init` | 8 passed |
| `npm run test:dashboard` | 8 passed |
| `npm run test:logging` | 5 passed |
| `npm run test:logging:docker` | 1 passed |
| `npm run test:i18n` | 4 passed |
| `node --import tsx --test tests/form-outcome.test.ts` | 2 passed |
| `npm run test:ui` | 43 passed against disposable SQLite |
| `npm run test:ui:production` | Build passed; 43 passed against disposable PostgreSQL |
| `npm run build && node --test tests/production-ui-server.test.mjs` | Build passed; 3 passed: SIGINT, SIGTERM, and occupied-port cleanup |
| `npm run check` | Biome and TypeScript passed |
| `prek run -a` | Biome and TypeScript passed |
| `git diff --check` | Passed |

The first production browser run had 40 passing tests and three failures. Two passkey tests failed because the harness used HTTP while production requires HTTPS. The permission test changed a hidden DOM input that hydration could restore before submission. Final runs pass with no skipped tests or retries: the harness uses test-only TLS, and the permission test changes the submitted request and checks that both exercise records remain unchanged. The passkey test also verifies the production session cookie's Secure flag.

Development tests retain `http://localhost:8784`. Production tests use `https://localhost:8784` with an ephemeral self-signed certificate, a loopback-only proxy, and a dynamically allocated loopback Next.js port. OpenSSL is required. Only the test browser ignores certificate trust errors; application origin checks and secure cookies remain enabled. Signal and occupied-port tests verify credential removal and server cleanup. No test server or disposable PostgreSQL container remains after verification. Port 8783 and production services are unchanged.

Review covered the complete follow-up diff, submitted-ID authorization, TLS isolation, forwarded headers, child-process and certificate cleanup, compatibility with HTTP development tests, and documentation accuracy. No application, schema, migration, or production configuration changes were required. Generated `next-env.d.ts` changes are excluded.

## Original delivery

Verified: 2026-10-11. Base: `origin/main` at `4dccffd`. Branch: `narumi/feat/training-roadmap`.

All nine roadmap features are implemented. This is pull-request delivery, not production deployment. [Training features](training-features.md) defines the data contracts, units, permissions, CSV format, and recovery procedure.

## Requirement evidence

| Feature | Implementation and evidence |
| --- | --- |
| Last-session values | `workout-history.ts` batches owner-scoped reads with local date boundaries and stable ties. `previous-session.tsx` shows the source date and ordered editable copies. Integration tests cover current, same-day, future, foreign, corrected, deleted, and tied history. Browser tests cover explicit keyboard copy, exercise switching without draft replacement, and no history. Existing repeat/template regressions pass. |
| Weekly consistency | `training.ts` derives 12 Sunday-start weeks, current/longest streaks, and annual activity without stored counters. Pure tests cover duplicates, gaps, the open week, Sunday/year transitions, leap days, corrections, deletion, and future dates. The private query requires completed work. Browser tests select 2024, inspect 366 labelled cells, and use keyboard focus across leap day. |
| Set types and RIR | The additive migration defaults legacy sets/templates to WORKING and actual RIR to null. Validation covers blank, zero, half steps, nonfinite values, and bounds. Working-only records and volume are separate from total volume. Browser tests create RIR, edit type, clear RIR, and repeat a warm-up with actual RIR cleared. Cached-form integration tests preserve omitted fields. Templates store type, not actual RIR. Legacy CSV helper fixtures pass without changing local scripts. |
| Active workout mode | `session-service.ts` implements guarded states, snapshot targets, persisted duration/deadlines, start tokens, and retry semantics. Integration tests cover ownership, repeated starts/completions, concurrent completion, version conflicts, pause/resume, partial finish, terminal-state rejection, and template changes. Browser tests cover actual edits, failed-draft retention, reload, pause/resume, confirmed skipped work, and abandonment. Reader review and eligibility tests exclude unfinished work from performed reports. |
| Exercise tags and muscle reports | The original controlled catalogue has validated primary/secondary/equipment relations. Creator/admin permissions are enforced server-side. Pure tests reject duplicate and invalid tags and verify independent compound/Unknown counts. Browser tests save tags, combine filters, and reject a spoofed foreign exercise ID. Existing exercise IDs and aliases survive migration. Reports query completed working sets within Sunday-start week boundaries and never sum muscle rows into a whole-body total. |
| Progression suggestions | Default-off template/exercise rules use explicit kg increments. Pure tests cover success, misses, skipped sets, changed targets/order, inconsistent loads, warm-ups, missing history, limits, and decimal increments. Queries restrict evidence to earlier owner sessions of the same template/exercise. Acceptance revalidates and locks the rule/source/session; it changes only uncompleted working targets. Browser tests reject corrected evidence before explicit acceptance. Keeping current targets requires no write. |
| Template scheduling | Owner-checked weekday assignments have tomorrow-effective historical intervals. User-row locks serialize revisions, starts, and template deletion. A unique owner/date link prevents concurrent duplicate starts. Integration tests cover repeated/concurrent starts and deletion-safe title/target snapshots. Browser tests assign, start, abandon, and remove a future occurrence while retaining the started snapshot. Calendar review verifies past/future status, half-open date intervals, and exclusion of manual/unfinished sessions from scheduled completion. |
| Measurements and goals | Owner/date uniqueness and cascade relations preserve workouts. Pure tests cover missing/invalid values, positive metric bounds, and nullable goals. Integration tests use overlapping dates for different owners. Browser tests log, edit, delete, clear a goal, inspect the weight target line, retain an invalid draft, and verify foreign privacy. Sorted weight and waist series filter null values independently; single/empty series and accessible chart tables remain valid. |
| Workout import/export | Authenticated private export excludes auth data. Version 1 parsing covers quoting, BOM, Unicode, formula-safe text, small numbers, supported states/targets, errors, and limits. Preview writes nothing. Confirmation reparses/revalidates mappings and duplicates in one transaction. Integration tests cover owner isolation, repeated/rekeyed imports, identical same-day multiplicity, and mid-batch rollback. Browser tests cover download, preview, cancel, errors, unknown-exercise creation, confirmation, duplicates, and counts. Batch recovery tests compare receipt fingerprints and remove only the exact unchanged owner/batch rows. |

## Verification commands

All commands run from the repository root. Results below are final passing runs, not expected outcomes.

| Command | Result |
| --- | --- |
| `npm run test:training` | 14 passed |
| `npm run test:training:sqlite` | 12 passed; legacy upgrade, empty upgrade, and backup restoration passed |
| `npm run test:training:postgres` | 12 passed; legacy upgrade, empty upgrade, and backup restoration passed |
| `npm run test:db-init` | 8 passed |
| `npm run test:dashboard` | 8 passed |
| `npm run test:logging` | 5 passed |
| `npm run test:logging:docker` | 1 passed |
| `npm run test:ui` | 7 passed: six existing regressions and the nine-feature workflow |
| `npm run test:ui:production` | Production build passed; 7 browser tests passed against disposable PostgreSQL |
| `npm run check` | Biome and TypeScript passed |
| `npm run build` | Passed, including the new authenticated routes |
| `prek run -a` | Biome and TypeScript passed |
| `git diff --check` | Passed |

Browser tests use `http://localhost:8784`. Mobile checks use a 390-pixel viewport and assert no horizontal overflow. Axe checks cover the new and changed routes. Test runners stop their servers and remove their disposable containers. Port 8783 and the production Compose project are not used.

An existing destructive-schema test initially failed because it matched exact Prisma spacing. It now matches the field independently of formatting and still proves data preservation. Browser checks initially exposed navigation/hydration timing and ambiguous selectors; they now wait for the changed route/data and use scoped controls. Final suites pass without error suppression. Expected rejection tests still emit server errors for invalid or unauthorized requests.

## Migration and recovery review

`20261011120000_training_roadmap` is one coordinated additive migration for overlapping models. It does not drop or convert historical data. Disposable legacy fixtures retain workout/set/exercise/alias/template IDs, 42.5 kg × 7 reps, one completed working set, 297.5 total volume, the training day, and the weight record. Existing template values survive; metadata and progression rules start empty.

SQLite uses a generated provider-specific schema and a derived upgrade from the tracked legacy fixture. PostgreSQL tests apply the named SQL migration. Recovery tests restore SQLite backups and PostgreSQL dumps into separate disposable databases and verify legacy workout and template values. Import recovery fixtures identify exact created rows through the owner and batch receipt, without date-based deletion or changes to other owners.

The full source, schema, migration, test, and documentation diff was reviewed for ownership, validation, transaction boundaries, retries, stale writes, timer cleanup, completion eligibility, dictionary coverage, legacy compatibility, and scope. No reference source or assets were copied. Production configuration, authentication contracts, the unrelated logging plan, generated clients, and personal workout files are unchanged. The pre-existing `next-env.d.ts` change is excluded from the commit.

## Decisions and release limits

- The owner confirmed that existing workout weights mean kilograms. Labels and interchange use kg; no stored values are converted.
- Existing server-local calendar dates and Sunday-start weeks remain unchanged. Time-zone preferences are outside scope.
- Current repository scripts use PostgreSQL for production and isolated SQLite for development. This supersedes the plans' older SQLite-production and port-8783 test assumptions.
- Production migration, deployment, the original production login investigation, and restoration of real production data are not performed or verified by this PR.
- Back up and restore-test the authorized database before deployment. Old application readers are unsafe after planned sessions exist; prefer a forward correction. A destructive restore or batch recovery needs separate authorization.
- CSV is workout interchange, not a complete account backup. Template definitions, scheduling definitions, measurements, aliases, rest deadlines, and active resume timestamps are not restored. Uploads over 5 MiB or 20,000 rows require files split at complete workout boundaries.
- The local Markdown/CSV tools remain separate. Their existing destructive date-replacement importer is not used by the web interface.

The completed nine temporary feature plans are replaced by this evidence and the delivered summaries in [the roadmap](roadmap.md). The roadmap remains maintained.
