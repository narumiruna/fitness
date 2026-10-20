# Hono Migration Verification

## Status

Implementation and local development verification are complete. PostgreSQL,
production-mode browser, and container verification are blocked by the missing
Docker daemon. Keep the PR in draft until these checks pass. This is not a
production deployment or a claim that all plan completion criteria have passed.

## Baseline and Isolation

- Base: `origin/main`, revision `8dd822b4eed44181c22a1a347cc971c16a02ac9f`.
- Branch: `narumi/refactor/hono-monorepo`.
- Initial working tree: only the five user-specified plan files were untracked.
- Baseline `npm ci`, `npm run check`, and `npm run build`: passed.
- Baseline i18n/dashboard/training/logging: 4/8/15/5 tests passed.
- Baseline isolated measurements browser tests: 3 passed.
- Local runtime: Node 26.10.0. The production image and CI target Node 24;
  dependency engines support it, but local results alone do not prove Node 24.
- All browser tests used disposable databases, refused server reuse, and stopped
  their own stack. Ports 8784 and 8785 were free after the final full run.
- Docker failed to connect to the configured OrbStack socket. No engine was
  started because that could also start existing production services.
- The exact previous production image is unavailable without production access.
  An operator must record it before any separately authorized rollout.

## Architecture and Decisions

- Four private npm workspaces: Vite/React web, Hono API, environment-neutral core,
  and HTTP contracts. One root lockfile; no Turborepo, Nx, public CLI, or npm release.
- The user selected Vite/React and authorized the complete plan. JavaScript is
  required; Server Action progressive enhancement is not retained. The disabled-
  JavaScript browser test verifies the visible `noscript` notice.
- Root PostgreSQL schema and migration history remain canonical. Only the client
  generator output path changes. SQLite remains derived and development ignores
  inherited PostgreSQL URLs and production origins.
- Setup count/create uses a serializable transaction. Password update/revocation
  is atomic; session issuance checks the verified password hash under a user lock.
  Concurrent setup and password-change regression tests pass.
- Workout metadata updates without a submitted version remain a documented
  existing last-write-wins limit. Session/set versions, request keys, database
  constraints, and owner checks remain in place.
- All cookie mutations have explicit Origin checks. Production requires exact
  canonical HTTPS `PASSKEY_ORIGIN`; startup fails if it is missing or invalid.
  Compose forwards it; manual deployment requires the repository variable.
- Deployment is manual only. Code/version PR merges do not deploy. No workflow
  was dispatched, package published, image published, or version tag created.
- Expected mutation failures retain drafts and use localized inline feedback.
  Missing-record feedback replaces Next.js's generated error page. SPA bootstrap
  redirects are asynchronous; tests wait for the resolved page before branching.
  Unknown API routes stay JSON 404s, never the SPA shell.

## Local Checks

| Check | Actual result |
| --- | --- |
| `npm ci` | Passed; both clients generated |
| `npm run check` | Biome and all workspace/root TypeScript checks passed |
| `npm run build` | Core, contracts, API, and Vite build passed |
| `npm test` | 64 pure/contract/Changesets/locale/logging/form tests passed |
| Core timezone repeat | 18 passed in America/New_York as well as the local timezone |
| `npm run test:api` | 21 passed on disposable SQLite; all 36 actions and 12 view schemas mapped in `apps/api/README.md` |
| `npm run test:training:sqlite` | 14 passed, including legacy/empty upgrades, concurrency, and backup restoration |
| `npm run test:ui` | All 50 passed in one run, 3.9 minutes, no retries or skips |
| Non-Docker environment/lifecycle/TLS partition | 26 passed: environment and safe startup, occupied ports, child/grandchild cleanup, duplicate signals, escalation, TLS forwarding and credential cleanup |
| `npm run test:db-init` | 26 passed; 2 Docker-dependent cleanup tests failed because the daemon is unavailable |
| `npm run test:training:postgres` | Attempted; blocked before tests by missing Docker socket |
| `npm run test:api:postgres` | Attempted; blocked before tests by missing Docker socket |
| `npm run test:ui:production` | Build passed; blocked before browser tests by missing Docker socket |
| Isolated `docker build --tag fitness-logging-test:local .` | Attempted; missing Docker socket |
| `npm run test:logging:docker` | Attempted; missing Docker socket; no app container created |
| `prek run -a` | Passed; rerun before the implementation commit |
| `git diff --check` | Passed before final staging |

Browser coverage includes virtual passkey registration/authentication, invalid
passwords/signatures, expiry/replay/removal, challenge capacity, setup/auth/admin,
owner isolation, CSV, session conflicts, lost-response creation retries, retained
drafts, locale, keyboard focus, axe, and layouts from 320px to 1440px.

## Legacy Checkpoint and Recovery Rehearsal

A disposable export of the baseline with the extracted core passed install,
check, build, 18 core tests, the 32 legacy pure tests, and 3 legacy measurements
browser tests on isolated port 8794. A separate fresh copy of the final workspace
passed `npm ci`, check, build, and all 21 API tests. Neither used real data.

The baseline-generated Prisma client read Hono-written workouts/sets, an active
training session, measurements, import/batch data, and passkey records. Hono
accepted an old-client-created SHA-256 session and legacy bcrypt password. A
signed software WebAuthn fixture stored with the old client authenticated through
Hono and updated its counter. SQLite backup restoration preserved representative
records across ten models. All disposable directories and servers were removed.

Schema models match the baseline after excluding the generator output path.
SHA-256 checks matched all four migration SQL files and `migration_lock.toml`.
No database migration, reset, re-seed, or historical data conversion is introduced.
Physical biometric hardware and cross-device passkey synchronization were not
verified. Production backup/restore and an actual image rollback were not run.

## Changesets Rehearsal

Eight Git fixtures verify package/empty changesets, missing changesets, changes
only on the base, merge-base handling, and missing history. Both version rehearsals
ran in disposable checkouts with no publication or tags:

- Package changeset: all four private versions, changelogs, dependency ranges,
  and lock entries changed to 1.0.1; root tooling version remained 1.0.0.
- Empty changeset: the file was consumed with no version bump or changelog.

The original checkout was unchanged by the rehearsals. The implementation changeset
remains unconsumed on this branch.

## Review and Remaining Limits

Review covered correctness, security, lifecycle, compatibility, regression tests,
and scope. It found and corrected missing Docker config helpers, production-origin
wiring, CI HTTP tests bypassing the disposable runner, calendar-date serialization,
empty SQLite aggregate BigInt handling, and orphaned process-group cleanup.
Repeated shutdown signals are tested because npm can forward the same signal that
was already sent to the process group. Calendar defaults also use the API's explicit
server-local date rather than the browser clock; the added client regression passed
with a browser clock in a different decade (7 focused client tests passed).

Remaining verification requires Docker or CI: Node 24 execution, PostgreSQL
transaction behavior, production HTTPS browser workflows, native container build,
non-root image startup/restart, and the complete database cleanup gate. Before an
authorized deployment, configure `PASSKEY_ORIGIN`, record the deployed image, and
restore-test a backup. Do not reset volumes or reverse SQL for this app-only change.

`npm audit` reports 5 existing dependency advisories (4 high, 1 low), mainly in the
Prisma CLI dependency chain plus esbuild. The legacy install reported 6. No broad
ORM/dependency major upgrade was added to hide these results. Vite also reports a
large initial JS chunk (about 606 kB before gzip); route modules are lazy-loaded.

The plans remain until all their missing evidence and required handoff checks are
resolved. Production services and real workout data remain untouched.
