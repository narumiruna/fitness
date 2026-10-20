# Hono Monorepo Migration: 04 Integration and Cutover Readiness

## Goal

Remove the legacy runtime, prove full-stack compatibility, and prepare a safe
release handoff. Completion means deployment-ready, not deployed.

## Context

Prerequisites: phases 01 through 03 pass. Current production uses
`compose.yaml`, the `fitness` Compose project, PostgreSQL volume
`postgres-data`, port 8783, and a self-hosted deploy workflow on every main push.
Do not use those services or their credentials for tests.

## Plan

- [x] Make root `dev`, `build`, `start`, `check`, and database commands operate
  on the final workspaces. Keep or document aliases for existing focused test
  and workout import/export commands. Verify clean install and generation from
  a fresh checkout with no generated artifacts present.
- [x] Serve the Vite build through Hono in production on port 8783. Route
  `/api` and `/data/export` before SPA fallback. Return JSON 404s for missing
  API routes and 404s for missing assets; serve the SPA only for valid browser
  navigation. Test asset traversal rejection, direct links, MIME/cache behavior,
  and no-store/private handling of authenticated responses.
- [ ] Adapt Docker workspace manifests, dependency installation, native SQLite
  prerequisites, generated clients, build output, and startup migration paths.
  Keep Node 24 unless the engine check requires an accepted change. Preserve
  non-root execution and migration-failure-before-listen behavior.
- [ ] Adapt isolated production UI HTTPS startup and runner cleanup. Preserve
  external `PASSKEY_ORIGIN`, Secure cookies, real Hono HTTP behavior behind a
  test HTTPS proxy, and fail-fast port conflicts. Use disposable PostgreSQL and
  a separate test image/project/network/volume; never run production Compose.
- [x] Adapt all runner paths and dependency resolution for npm hoisting. Retain
  SQLite initialization safeguards, PostgreSQL cleanup tests, failure/signal
  cleanup tests, and refusal to reuse an existing browser-test server.
- [x] Add CI jobs for clean installation, Biome, all workspace typechecks/pure
  tests/builds, Changesets presence/status, isolated database tests, Playwright
  development and production-mode tests, and a separate container smoke test.
  Database tests must not appear passed when their database cases were skipped.
- [x] Resolve the auto-deploy gate before any migration or version PR merge.
  Propose an explicit authorized deployment trigger separate from Changesets
  versioning. Changes to the production workflow/Compose configuration, merges
  that trigger deployment, and service operations require explicit authorization.
  If authorization is unavailable, retain the existing files and mark deployment-
  workflow changes blocked; do not claim the gate is resolved.
- [x] Remove legacy root Next pages/actions/components after their replacements
  pass; remove Next, `@next/env`, `server-only`, Next configuration, generated
  type references, and obsolete React server test conditions. Verify no active
  source, runner, dependency, or build step requires Next.js.
- [x] Update README, environment examples, release documentation, commands, and
  scoped agent guidance for Vite/Hono boundaries and canonical root Prisma paths.
  Use the write-agents-md skill when changing agent guidance. Do not remove the
  Next-generated instruction block until the Next runtime is removed and its
  regeneration no longer applies. Document same-origin security, startup,
  locale, logging, JavaScript requirement, and test isolation.
- [ ] Run the complete verification matrix below and record command, result,
  and remaining limits in `docs/hono-migration-verification.md`. Repeat after
  any verification-driven code changes.
- [x] Rehearse Changesets version-only release in a disposable checkout; check
  private versions/changelogs, dependency ranges, lockfile, and subsequent builds.
  Use no npm publication, remote tags, or production deployment.
- [ ] Prepare the handoff with the prior revision/image, unchanged schema and
  migration checksums, pending deployment approval, accepted behavior differences,
  and recovery evidence. Do not apply migrations or replace production services.

## Verification Matrix

Use the retained root aliases or document their replacements before running.

| Check | Required evidence |
| --- | --- |
| `npm ci`, `npm run check`, `npm run build` | Fresh workspace install, type/lint checks, API and browser output |
| `npm run test:i18n`, `test:dashboard`, `test:training`, `test:logging` | Pure rules, locale, calculations, Hono log privacy and request isolation |
| API HTTP suites | Every endpoint matrix row, CSRF/media-type/body-limit errors, user isolation |
| `npm run test:db-init` | Safe SQLite startup, environment precedence, child/container cleanup |
| `npm run test:training:sqlite` and `test:training:postgres` | Existing-data upgrade, concurrency, and backup restoration |
| `npm run test:ui` | All adapted E2E workflows, lost-response retries, axe and responsive checks |
| `npm run test:ui:production` | Built Hono/static app, disposable PostgreSQL, HTTPS/cookies/passkeys |
| Separate image smoke and `test:logging:docker` | Non-root startup, migrations, logs, assets/deep links, stop/restart |
| `prek run -a` | Final pre-commit gate with intended files only |
| Changesets fixtures and version rehearsal | PR checks, private versions/changelogs and lockfile consistency |

Docker/Chrome/CI availability is a prerequisite for the relevant checks. If
unavailable, record the missing prerequisite and leave the check open.

## Rollback / Recovery

- No data model or SQL migration changes are planned. Compare models and migration
  file checksums against the baseline; explain only client-output path changes.
- In a separate test environment, write representative workouts/sets, sessions,
  passkeys, imports, and measurements through Hono, then verify the previous app
  can still read the same database. Verify representative pre-existing session
  cookies and stored passkeys remain usable by Hono.
- Rehearse backup restoration only with disposable data. Retain the prior image
  for an authorized application rollback. Do not reset volumes or reverse SQL
  migrations to roll back an application-only change.
- Production changes, backup access, restore, release merges, and rollout
  monitoring remain separate authorized operations.

## Execution Evidence

Fresh disposable workspace installation, check, build, and API tests passed.
The local full browser run passed 50 tests; lifecycle/environment/TLS checks passed
25 tests, including process-group escalation and duplicate shutdown signals.
The old generated Prisma client read Hono-written records and restored backups;
legacy bcrypt/session/software WebAuthn fixtures worked with Hono. Schema models
and all migration hashes are unchanged. Docker/production-mode checks remain open.
The previous production image reference must be supplied before an authorized
rollout; no production access or deployment was performed.

See `docs/hono-migration-verification.md` for limits and final handoff.

## Completion Checklist

- [ ] Full verification matrix passes with links or recorded command results.
- [ ] No legacy runtime, accidental server import, or duplicated backend remains.
- [x] Database compatibility and recovery rehearsal pass without real data access.
- [x] Private Changesets release rehearsal passes without publication.
- [ ] Production auto-deploy risk has an authorized resolution, or this item
  remains explicitly blocked pending that authorization.
- [ ] Documentation/handoff is complete; production remains untouched.
- [ ] Record results in 00 before deleting this completed plan.
