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

## Fitness MCP Verification — 2026-10-22

This section is separate from the completed Hono migration above. MCP is implemented
on `narumi/feat/fitness-mcp` from `origin/main` at `7715092`, but the complete launch
checklist is **not passed**. The retained plan is
`docs/plans/2026-10-22_fitness-mcp-plan.md`. No production service was operated,
workflow dispatched, package published, or version tag created.

### Implementation and review

- One Hono `/mcp` endpoint serves seven typed tools over Streamable HTTP, using
  `@modelcontextprotocol/server` 2.3.1. Revisions `2026-07-28`, `2025-11-25`, and
  `2025-06-18` are supported; default Codex actually required the last revision.
- OAuth authorization/code/token handling uses `@node-oauth/oauth2-server` 5.3.1,
  PKCE S256, public CIMD or pre-registered clients, opaque hashed credentials,
  audience/scope checks, rotating refresh tokens, replay revocation, and explicit
  browser consent. Browser cookies never authorize a tool call.
- Additive migration `20261022150000_mcp` adds clients, pending requests, grants,
  hashed codes/tokens, and payload-bound write receipts. Deletion leaves receipt
  tombstones; account deletion cascades credentials and receipts.
- Independent source review identified client-name impersonation, missing frame
  protection, and admission/deadline checks after token lookup. Fixes show canonical
  client IDs with a warning, add `frame-ancestors 'none'` and `X-Frame-Options: DENY`,
  and arm bounded caller admission and the 15-second deadline before database
  verification. A deterministic stalled-verifier test checks timeout and retained
  admission slots. Public-client quotas are namespaced by user.
- Writes validate the grant again under the same user-row lock used by revocation.
  Cancellation checks inside the transaction prevent observed canceled writes;
  an already committed write is recovered through its stable operation ID.
- Password changes retain separately granted OAuth access. Recovery instructions
  require explicit revocation of each untrusted connection; the UI states that
  revoking one connection does not revoke other connections for that client.
- `npm audit` still reports five dependency advisories: four high and one low,
  in existing Prisma tooling/esbuild dependency chains. No broad dependency upgrade
  was added to this feature.

### Actual local results

| Check | Actual result |
| --- | --- |
| `npm ci` | Passed; both Prisma clients generated from the canonical models. |
| `npm run check` | Passed, including Biome and root/workspace TypeScript. |
| `npm run build` | Passed for core, contracts, API, and Vite. |
| `npm test` | Passed: 86 tests across core, contracts, Changesets, locale, dashboard, training, logging, and form outcomes. |
| `npm run test:api` | Passed: 62 disposable SQLite tests, including exact 50,000-set analysis and rejection above the budget. |
| `npm run test:api:postgres` | All 62 cases passed in CI run `39808061618`. Earlier local 61-case suites passed; the later local 62-case attempt failed before tests with `Connection terminated unexpectedly`. |
| `npm run test:training:sqlite` | Passed: 15 tests, including legacy/empty upgrades, restoration, constraints, tombstones, and cascades. |
| `npm run test:training:postgres` | Passed: the same 15 tests on a separate disposable PostgreSQL container. |
| UTC and Asia/Taipei HTTP repeat | Earlier 60-case API suites passed under both timezones. Pure calculation fixtures also passed in UTC, Asia/Taipei, and America/New_York. |
| `npm run test:ui -- mcp.spec.ts` | Initial six MCP browser cases passed locally. Final identity/frame-protection cases passed as part of the 59-case production HTTPS CI suite. |
| `npm run test:ui` | Not passed. One attempt was interrupted after development rebuilds caused connection errors. A stable-source retry exceeded 120 seconds in the first test's browser-context/beforeEach setup and again in teardown. Both runs were stopped, and only their own server processes were cleaned up. No existing listener was stopped to free a port. |
| `npm run test:db-init` | All 29 cases passed in CI run `39808061618`. The local command hit the 300-second tool deadline; its last lifecycle case failed during interruption. No timing assertion was relaxed. |
| `prek run -a` | Passed after final intended source changes and before the implementation commit. |
| Native clients | Gate exits nonzero. See below; core-workflow passes are not a complete launch pass. |
| Public Pi CIMD resolver | Passed: one public metadata GET and cache verification, no credentials or workout data sent. |
| Native Pi CIMD | Passed with Pi 1.4.0 built-in client, protocol `2025-11-25`, no pre-registered client ID, seven tools, scoped consent, refresh, and revocation. |
| `npm run test:ui:production` | All 59 cases passed in CI run `39808061618`, including final MCP identity/frame checks. |
| CI checks and image-smoke | Passed in CI run `39808061618`. |

### Complete CI matrix

[CI run 39808061618](https://github.com/narumiruna/fitness/actions/runs/39808061618)
passed all five jobs on source revision `eab0096`: checks, databases, development
browser, production browser, and image-smoke. Both browser modes passed all 59
cases; database-init passed 29, each training upgrade runner passed 15, and the
PostgreSQL API suite passed 62. Local failures above are retained as local results,
not reclassified as passes. Later evidence-only commits do not change that tested
source. This green matrix does not include or override the failing native client
gate.

### Native client boundary and blockers

`tests/mcp-clients.md` records commands, exact native interfaces, callback URIs,
versions, and limits. Tests use temporary configuration/credential directories,
synthetic accounts, real loopback OAuth callbacks, and no agent/model turns.
The macOS Keychain is blocked for these test hosts. No real provider credential,
user configuration, or production data is used.

Pi 1.4.0, Codex CLI 0.163.0 default/modern, and Claude Code 2.1.303 v1/v2 completed
core scoped seven-tool workflows in earlier runs. The final general rerun passed
Pi and both Codex modes; Claude v1 failed concurrent refresh, and Claude v2 failed
at its refresh stage. Claude consistently races refresh after simultaneous `401`
responses; default Codex also showed an intermittent race in earlier runs. One
refresh succeeds, another reuses the consumed token, and Fitness correctly revokes
the entire family. Users must then sign in again. The native test intentionally
retains a failing assertion; it does not skip this condition or disable replay
revocation. A subsequent isolated test of the latest Claude Code 2.1.308 passed
all core workflows but reproduced the concurrent race in both Claude runtimes;
Codex modern also reproduced the race. No global CLI installation was changed.

Native Pi CIMD passed separately using `oauth.clientRegistration = "cimd"`, with
no client ID override. Native Codex/Claude CIMD and normal agent-session exposure
or human approval UI are not established by the native machine-control fixtures.
Tool annotations are hints, not authorization or proof of human approval.

The PR must remain draft until outstanding verification passes and the native
launch failure is fixed upstream or receives an explicit accepted disposition.
CI browser/database checks are separate evidence; passing them cannot turn a
failing native client gate into a pass.

## Web UI/UX remediation — 2026-10-22

The implementation branch `narumi/fix/web-ui-ux-remediation` starts from
`origin/main` at `62f05a8`. It addresses U01–U17 without a JSON API/schema change,
production operation, deployment, publication, or version tag. The separate
[remediation record](reviews/web-ui-ux-remediation.md) contains the content
outlines, resolution table, actual command results, earlier failed attempts,
recovery decisions, and remaining gates. The retained
[plan](plans/2026-10-22_web-ui-ux-remediation-plan.md) is not complete.

- `npm ci`, `npm run check`, and `npm run build` passed. The existing Vite
  entry-chunk size warning remains.
- `npm test`: 76 passed. `npm run test:api`: 62 passed with disposable SQLite.
  `npm run test:training:sqlite`: 15 passed.
- `npm run test:ui`: all 109 cases passed in 7.4 minutes, with no skips or
  retries; a fresh 109-case repeat passed in 7.7 minutes after the Save-only
  input-Enter correction and final zoom fixtures. A later direct-unknown-URL
  server correction passed all 62 HTTP cases and a 32-case browser subset.
  CI run `39831152427` verifies source revision `1957eac`: production HTTPS
  passed all 109 cases in 7.8 minutes, and checks/databases/image-smoke passed.
  Development CI was still installing Chrome at that recording. A later repeat
  (`39833130662`, docs-only source `9a70f88`) had one test-readiness failure in
  each browser mode, with 108 passes each, and is not reported passed. Filter
  form-commit and dialog-opacity waits now preserve all assertions; 69 controlled
  stress cases passed across three explicit repetitions. New CI is pending.
- The matrix includes both locales, 1440/390/320-pixel layouts, and 38 native
  200% Chrome-zoom samples with actual viewport/DPR/PNG-width checks. Keyboard,
  axe, pending-close failure recovery, retained drafts, and no-duplicate-write
  assertions are separate from participant or screen-reader evidence.
- The full and final focused runners returned zero. Separate checks found no
  listeners on 8784/8785 or runner-owned supervisor after cleanup. No existing
  service was stopped or reused.
- `npm run test:ui:production` built successfully but was blocked before browser
  execution by an unavailable Docker daemon. No local production-mode or
  PostgreSQL check is claimed passed locally. The isolated CI database job passed
  29 database-init tests, 15 upgrade tests for each provider, and 62 PostgreSQL
  HTTP cases; its production browser job passed all 109 cases. These results
  refer to [run 39831152427](https://github.com/narumiruna/fitness/actions/runs/39831152427)
  on source revision `1957eac`, not a historical migration run.
- A new HTTP assertion reproduced plain-text unknown browser recovery (61 passed,
  one failed). The bounded server fallback now returns the existing HTML shell
  with HTTP 404 for extensionless unknown browser URLs, with no-store and empty
  HEAD bodies. JSON API, asset, machine endpoint, file-like, and traversal failures
  retain their boundaries. All 62 HTTP cases then passed.
- `prek run -a` passed for Biome and TypeScript and is repeated before committing.
- Five unfamiliar participants, real screen-reader tasks, physical-device
  passkeys and deliberate browser-dialog dismissal, complete manual state
  coverage, and user acceptance remain open. The PR must remain draft until
  evidence is supplied or each applicable limitation is explicitly accepted.
