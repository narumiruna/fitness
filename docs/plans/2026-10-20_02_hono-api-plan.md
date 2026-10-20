# Hono Monorepo Migration: 02 Hono API and Contracts

## Goal

Replace Next.js backend responsibilities with a testable Hono HTTP API while
preserving validation, permissions, credentials, transaction behavior, and data.

## Context

Prerequisite: phase 01. Reference behavior is in `src/app/actions/`, page queries
under `src/app/`, and server helpers under `src/lib/`. After this phase changes
client generation and backend ownership, the old Next app is reference code only;
it is not a second supported backend. Do not merge this partial state into main.

## Architecture

Use `apps/api/src/app.ts` for the Hono app and `server.ts` for process startup.
Keep routes small and related service logic together. Use `app.request()` for
HTTP tests and real sockets for lifecycle/proxy tests. Create
`@narumitw/fitness-api` and `@narumitw/fitness-contracts` as private workspaces.

Keep the canonical root Prisma schema and migrations. Generate both clients into
ignored paths under `apps/api/src/generated/`; do not maintain a manual SQLite
schema. Build services without Next.js aliases or React server conditions.

## Plan

- [x] Build a page-read/action-to-endpoint matrix covering setup, auth, users,
  passkeys, workouts/sets/templates, sessions, schedules, progression, exercises,
  aliases/metadata/history, measurements/goals, calendar/stats, locale, and CSV.
  Record request schema, response DTO, permission, transaction, and test per row.
- [x] Implement contracts with explicit schemas and safe output fields. Define
  400 validation, 401 authentication, 403 origin/permission, 404 missing resources,
  409 conflicts, 413 upload limits, 503 challenge capacity, and sanitized 500
  failures. Document owner-scoped 404 responses. Test date-only strings versus
  timestamps, numeric values, nulls, and exclusion of secret/BigInt/Bytes fields.
- [x] Create the Hono app, Node server, error boundary, and body parsing limits.
  Keep API 404s JSON; never return the SPA shell for unknown API routes.
  Test malformed JSON, wrong media types, unsupported methods, and bounded reads.
- [x] Replace Next.js request security with explicit cookie-mutation protection.
  Validate Origin against the trusted external origin, including anonymous setup,
  login, locale, and passkey requests; reject cross-site and missing-origin
  mutations unless a documented safe alternative is implemented. Do not trust
  forwarded headers as authorization input. Test JSON and simple form requests.
  Keep development same-origin through the Vite proxy; do not enable broad CORS.
- [x] Port session/password/setup/admin flows. Preserve bcrypt hashes,
  `fitness_session`, token hashing, 30-day expiry, HttpOnly/Lax/path cookies,
  production Secure cookies, logout, role checks, and password-change revocation.
  Verify an existing seeded session works with Hono. Resolve or record the
  existing setup/password concurrency gaps from 00 with regression evidence.
- [ ] Port all five passkey operations. Preserve exact `PASSKEY_ORIGIN`, RP ID,
  loopback development rules, challenge cookie attributes, five-minute expiry,
  one-time consumption, purpose/user binding, user verification, counter CAS,
  serializable retry, and the global 1,000-challenge limit. Test wrong origin,
  replay, expired challenge, concurrency, capacity failure without cookie writes,
  previous-cookie replacement, and removal on both database providers.
- [x] Move Prisma setup and database tools to API ownership while keeping root
  commands usable. Replace `@next/env` with explicit root environment loading
  that preserves the current documented precedence; test it without real env
  files. Resolve SQLite paths from the repository root and ignore inherited
  PostgreSQL URLs in development. Preserve seed credentials and non-destructive
  schema synchronization; fail startup before listening on initialization error.
- [x] Port workout/set/template/session services with user ownership enforced by
  the API. Preserve stable creation/start keys, user-row serialization, submitted
  session versions, `actualsEntered`, partial finish, elapsed/rest timing,
  scheduled uniqueness, and progression source checks. Test commit-with-lost-
  response retry, stale versions, concurrent starts, and cross-user IDs.
- [x] Port exercise catalog, rename/alias permissions, metadata, measurements,
  goals, schedules, and all history/calendar/statistics reads. Preserve pagination,
  filters, nullable fields, same-date upsert, effective dates, and completed-set
  metrics. Test admin/non-admin and owner/non-owner requests.
- [x] Port CSV preview/confirmation/export and root import/export utilities.
  Preserve v1 formats, 5 MiB file and 20,000-row limits, mapping limits,
  fingerprints, duplicate multiplicity, atomic confirmation, and identity across
  import reruns. Bound multipart overhead separately; keep download headers and
  the existing `/data/export` download URL through a server compatibility route.
- [x] Port locale resolution and its one-year HttpOnly cookie. Add an initial
  bootstrap/session response for user, setup status, and resolved locale.
  Preserve cookie > supported Accept-Language > English precedence, including
  zh-TW/zh-Hant/zh-HK/zh-MO and rejection of unspecified/Simplified zh fallback.
- [x] Replace Next proxy/instrumentation/action logging with Hono middleware and
  service logging. Generate and return request IDs, ignore caller correlation
  metadata, preserve request context through Prisma operations, and redact the
  same secrets and error messages. Test concurrent isolation and all failure paths.
- [ ] Adapt API/database tests and test fixtures to new paths and imports. Keep
  SQLite and isolated PostgreSQL upgrade/recovery suites. Add a Changeset for
  API/contracts/core behavior changes with accurate private dependency ranges.

## Rollback / Recovery

No model or SQL migration change is expected. Restore the phase-01 code and client
generation paths together if API parity fails. Never use schema reset, generated
file edits, real database copies, or production containers for verification.

## Execution Evidence

API/contracts builds and checks pass. The disposable SQLite HTTP suite has 21
passing tests; contracts have 4 passing tests. Existing SQLite integration/upgrade
and recovery has 14 passing tests. All 36 actions and 12 view schemas are mapped
in apps/api/README.md. PostgreSQL and the both-provider passkey acceptance checks
remain blocked by the absent Docker daemon. Browser virtual-passkey checks pass.

See `docs/hono-migration-verification.md` for limits and final handoff.

## Completion Checklist

- [x] Every endpoint-matrix row has passing contract/permission tests.
- [ ] Auth, CSRF, passkey, redaction, and concurrency suites pass.
- [ ] SQLite and isolated PostgreSQL integration/upgrade/recovery suites pass.
- [x] Development startup uses safe SQLite and cleans up its own processes.
- [x] API/contracts/core checks and builds pass without Next.js dependencies.
- [x] No security decision or test requirement remains silently deferred to UI.
- [ ] Record results in 00 before deleting this completed plan.
