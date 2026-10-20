# Hono Migration Verification

## Status

The initial full matrix passed in
[CI run 39443905437](https://github.com/narumiruna/fitness/actions/runs/39443905437)
on revision `fcffee5`: all five jobs passed, with 51 cases in each browser mode.
A later same-page focus regression increased each browser suite to 52 cases;
all 52 passed locally. [PR #20 checks](https://github.com/narumiruna/fitness/pull/20/checks)
contain the final commit's complete matrix. No production deployment was performed.

All five migration plans are complete and removed. The prior image reference was
recovered from the existing successful deployment log without connecting to
production services. Actual deployment and production backup/restore remain
separate authorized operations.

## Baseline and Isolation

- Base: `origin/main`, revision `8dd822b4eed44181c22a1a347cc971c16a02ac9f`.
- Branch: `narumi/refactor/hono-monorepo`.
- Initial working tree: only the five user-specified plan files were untracked.
- Baseline `npm ci`, `npm run check`, and `npm run build`: passed.
- Baseline i18n/dashboard/training/logging: 4/8/15/5 tests passed.
- Baseline isolated measurements browser tests: 3 passed.
- Local runtime: Node 26.10.0. CI verified Node 24.21.0; the separate production
  image ran Node 24.22.0. No Node 26 production upgrade was introduced.
- All browser tests used disposable databases, refused server reuse, and stopped
  their own stack. Ports 8784 and 8785 were free after the final full run.
- Docker failed to connect to the configured OrbStack socket. No engine was
  started because that could also start existing production services.
- The last successful [deployment run 38538142730](https://github.com/narumiruna/fitness/actions/runs/38538142730)
  deployed the exact baseline revision on 2026-10-14. It built local image
  `fitness-fitness:latest` with Docker image ID
  `sha256:b4cb78f545cd0b780caa05f6a71ca2fe1f8d5d902e11f619940b31e89cf946e6`
  and recorded `fitness-fitness-1` recreated and started. This is a local image ID,
  not a registry digest. Live container state and image retention were not inspected;
  the operator must confirm and retain this image before an authorized rollout.

## Architecture and Decisions

- Four private npm workspaces: Vite/React web, Hono API, environment-neutral core,
  and HTTP contracts. One root lockfile; no Turborepo, Nx, public CLI, or npm release.
- The user selected Vite/React and authorized the complete plan. JavaScript is
  required; Server Action progressive enhancement is not retained. The disabled-
  JavaScript browser test verifies the visible `noscript` notice.
- Root PostgreSQL schema and migration history remain canonical. Only the client
  generator output path and explicit JavaScript import extension change. SQLite
  remains derived; development ignores inherited PostgreSQL URLs and production origins.
- Setup count/create uses a serializable transaction. Password update/revocation
  is atomic; session issuance checks the verified password hash under a user lock.
  Concurrent setup and password-change regression tests pass.
- Workout metadata updates without a submitted version remain a documented
  existing last-write-wins limit. Session/set versions, request keys, database
  constraints, and owner checks remain in place.
- All cookie mutations have explicit Origin checks. Production strips trailing
  slashes from `PASSKEY_ORIGIN`, then requires a canonical HTTPS origin. Startup
  fails if it is missing or invalid. Compose forwards it; manual deployment
  requires the repository variable. Request Origin headers are not normalized.
- Deployment is manual only. Code/version PR merges do not deploy. No deployment
  workflow was dispatched, package published, image published, or version tag created.
- Expected mutation failures retain drafts and use localized inline feedback.
  Missing-record feedback replaces Next.js's generated error page. SPA bootstrap
  redirects are asynchronous; tests wait for the resolved page before branching.
  Unknown API routes stay JSON 404s, never the SPA shell.

## Verification Results

| Check | Actual result |
| --- | --- |
| `npm ci` | Passed; both clients generated |
| `npm run check` | Biome and all workspace/root TypeScript checks passed |
| `npm run build` | Core, contracts, API, and Vite build passed |
| `npm test` | 64 pure/contract/Changesets/locale/logging/form tests passed |
| Core timezone repeat | 18 passed in America/New_York as well as the local timezone |
| `npm run test:api` | 21 passed on disposable SQLite; all 36 actions and 12 view schemas mapped in `apps/api/README.md` |
| `npm run test:training:sqlite` | 14 passed, including legacy/empty upgrades, concurrency, and backup restoration |
| `npm run test:ui` | All 52 passed locally (4.0 minutes); CI snapshot: 51 passed (4.6 minutes). Final PR checks run the expanded 52-case suite without retries or skips |
| `npm run test:db-init` | All 29 passed in CI, including both Docker cleanup cases, readiness probes, occupied ports, process groups, duplicate signals, escalation, TLS forwarding and credential cleanup |
| `npm run test:training:postgres` | All 14 passed in CI, including upgrade, concurrency and backup restoration |
| `npm run test:api:postgres` | All 21 passed in CI |
| `npm run test:ui:production` | CI snapshot: 51 passed with built assets, disposable PostgreSQL and HTTPS (4.7 minutes). Final PR checks require all 52 cases without retries or skips |
| Isolated `docker build --tag fitness-logging-test:local .` | Passed in CI; no image publication |
| `npm run test:logging:docker` | Both tests passed: non-root startup/auth/log privacy/assets/restart, and failed migrations stopping before the API starts |
| `prek run -a` | Passed before each implementation/test commit; repeated for the final documentation commit |
| `git diff --check` | Passed before final staging |

Local Docker commands initially failed at the missing OrbStack socket. CI supplied
the missing isolated environment; those failures were not reported as local passes.
Earlier CI failures exposed real startup/import/focus/test-driver issues, corrected
before the green run above. One Prisma engine download also failed with ECONNRESET.
No test was skipped or changed to accept failure.

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

Schema models match the baseline after excluding the generator configuration.
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

### PR review: muscle report week

[Review item R1](https://github.com/narumiruna/fitness/pull/20#discussion_r4327091515)
identified a P2 period-label defect introduced by client rendering. The muscle
report now derives its week from the stats view's `today`, through `calendarDate`,
as the consistency report does. No API filter, schema, or count rule changed.

The browser regression uses `America/New_York` at `2030-01-06T00:30:00.000Z`.
It checks that the browser is still on Saturday, January 5, while the API supplies
Sunday, January 6. Before the fix, the heading was `2029-12-30`; after the fix,
it is `2030-01-06`. The existing zero counts remain unchanged. All 9 focused
client tests, `npm run check`, and `npm run build` passed locally. Final PR checks
run the expanded 53-case browser suite in both modes.

### Follow-up: trailing slashes in the production origin

`PASSKEY_ORIGIN` now accepts one or more trailing `/` characters. Startup, CSRF,
and passkey checks use the same validated canonical origin. Paths, queries,
fragments, credentials, non-HTTPS URLs, and other noncanonical values remain
invalid. Request origins must still match exactly; forwarded headers cannot
select the trusted origin.

Local verification on 2026-10-20 passed:

- `npm ci`, `npm run check`, `npm run build`, and all 64 tests in `npm test`.
- `prek run -a` and `git diff --check`: passed.
- `npm run test:api`: 23 tests passed with disposable SQLite.
- `npm run test:api:postgres`: 23 tests passed with a separate disposable
  PostgreSQL container in production mode. The runner removed the container.
- New cases cover single/multiple trailing slashes, canonical passkey RP IDs,
  CSRF acceptance, noncanonical/untrusted request origins, forwarded headers,
  and cross-site rejection.

The initial API attempt failed because workspace builds and generated clients
were missing. It passed after `npm ci` and `npm run build:packages`. Browser
workflows were not repeated for this server-only change. No production settings,
services, or data were changed, and no deployment was performed.

### Migration review

Review covered correctness, security, lifecycle, compatibility, regression tests,
and scope. Corrections include missing Docker config helpers, production-origin
wiring, disposable HTTP runners, calendar-date serialization, empty SQLite aggregate
BigInt handling, and orphaned process-group cleanup. Additional CI-driven fixes:

- Prisma generation now sets `importFileExtension = "js"`. Docker installs before
  copying tsconfig files; default TypeScript imports broke the compiled runtime.
  A no-tsconfig fixture checks both generated clients.
- Temporary port reservations destroy readiness-probe sockets. Otherwise closing
  the reservation can wait forever. A controlled fixture reproduced the old
  deadlock and passed after the fix.
- Cross-page route focus uses a layout effect. Same-page mutation redirects leave
  the active control focused, even if the user selected it while refreshed data
  was arriving. An independent regression failed before this fix and passed after
  it; all 8 focused client cases pass. Malformed fragments are ignored instead
  of causing a URI error. Skip-link tests wait for SPA bootstrap before pressing Tab.
- The range test compares rendered text with rendered text. Its old `innerText`
  capture plus default `textContent` assertion passed before any data changed,
  allowing interaction with a select during navigation. A browser experiment
  reproduced this; the corrected assertion waits for the actual range result.
- Container logging tests directly request an unauthorized private endpoint.
  Bootstrap can redirect before a private query starts; the test no longer depends
  on that request race. All original privacy/event assertions remain.
- Repeated shutdown signals are tested because npm can forward a process-group
  signal twice. Calendar defaults use the API's server-local date, not the browser
  clock; a regression test runs with the browser clock in a different decade.

Node 24, PostgreSQL, production HTTPS, native image build, non-root startup/restart,
and the database cleanup gate are now verified in CI. Before a separately authorized
deployment, confirm and retain the recorded prior image, configure `PASSKEY_ORIGIN`,
and restore-test a production backup. The image reference above comes from existing
workflow records, not a live production inspection. Do not reset volumes or reverse
SQL for this app-only change.

`npm audit` reports 5 existing dependency advisories (4 high, 1 low), mainly in the
Prisma CLI dependency chain plus esbuild. The legacy install reported 6. No broad
ORM/dependency major upgrade was added to hide these results. Vite also reports a
large initial JS chunk (about 606 kB before gzip); route modules are lazy-loaded.

All implementation and required handoff evidence is recorded here. Production
services and real workout data remain untouched; no rollout, publication, or version
tagging was performed.
