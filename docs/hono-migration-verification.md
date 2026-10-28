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

## Deployment Docker readiness fix

- [Failed run 39887994733](https://github.com/narumiruna/fitness/actions/runs/39887994733)
  failed before image build because the runner's OrbStack Docker socket was absent.
- The workflow now starts OrbStack only when Docker is unavailable on macOS with
  the `orbstack` context, then checks readiness before building.
- Parsed the workflow with `yaml` and tested its exact readiness shell block with
  mocked `docker`, `orbctl`, and `sleep` commands. All five cases passed: Docker
  already ready, OrbStack recovery, failed recovery, another context, and Linux.
  Confirmed that the trigger remains manual and the step timeout is three minutes.
- `git diff --check` passed. No real Docker startup, production service operation,
  or workflow dispatch was performed. Live recovery remains unverified.

## Training UI/UX refresh baseline — 2026-10-28

- Revision: `cca619b`; no UI implementation changes were present.
- `npm run test:ui -- apps/web/e2e/visual-dashboard.spec.ts`: 1 passed.
  The case covers Workouts, Calendar, Stats, and Exercises at 1440/768/390 pixels,
  with overflow assertions and WCAG A/AA axe checks at each width.
- Captured 24 before-change screenshots in ignored
  `.cache/uiux-refresh/before/`, using disposable SQLite data.
- The runner exited successfully and ports 8784/8785 had no listeners afterward.
- Inspected desktop/mobile Workouts, desktop Stats, and mobile Exercises captures;
  reviewed training-entry and session-control source separately.
- `codex_imagegen` was initially unavailable. The user later enabled its model
  tool; the agent did not change settings or credentials. The implementation
  and verification results follow below.

## Training UI/UX refresh verification — 2026-10-28

The [review and design plan](reviews/training-uiux-refresh.md) records findings,
the generation brief, selected decisions, implementation sequence, and recovery.
`codex_imagegen` generated `.cache/uiux-refresh/proposal.png` (1536 × 1024) from
synthetic content; the image was inspected before implementation. No generated
image is committed or used by the app.

| Check | Actual result |
| --- | --- |
| `npm run check` | Passed: Biome and root/workspace TypeScript |
| `npm test` | 82 passed; no failures or skips |
| `npm run build` | Passed; Vite reports a chunk larger than 500 kB |
| `npm run test:api` | 83 passed with disposable SQLite |
| `npm run test:api:postgres` | 83 passed with a separate PostgreSQL test container |
| `npm run test:ui` | 137 passed in 14.4 minutes; no retries or skips |
| `npm run test:ui:production` | 137 passed in 17.4 minutes with isolated PostgreSQL and HTTPS; no retries or skips |
| Final focused `training-entry.spec.ts` run | 2 passed after the feedback-width/input-alignment correction; exit 0 |
| `prek run -a` | Passed: Biome and TypeScript hooks |

Coverage includes both locales and roles, 320/390/768/1440-pixel layouts,
keyboard focus, closed/open menu axe checks, real 200% Chrome zoom, private
ongoing sessions under history filters/page 2, long-session controls, and the
existing authentication/training/recovery workflows. A retry regression verifies
that a lost committed response followed by template switching still creates only
one session. Visual inspection also identified template feedback width and input
alignment; final layout assertions cover those corrections.

Development artifacts were copied to `.cache/uiux-refresh/development/` (361 PNG
captures), and production artifacts to `.cache/uiux-refresh/production/`. Baseline
captures remain in `.cache/uiux-refresh/before/`. Desktop/mobile dashboards,
Chinese mobile navigation, the active current-set layout, and the final template
failure/retry layout were visually inspected. An earlier
partial development run was stopped for code-review fixes; only its own orphaned
test supervisor was stopped, and both ports were confirmed free before restart.
That interrupted run is not counted as passed verification.

The final focused development run emitted `kill EPERM` from the unchanged
`scripts/dev.mjs` process-group existence check during shutdown, after both tests
passed. Its runner returned 0. Afterward, ports 8784/8785 had no listeners, no test
supervisor remained, and no disposable PostgreSQL container remained. The full
development and production runs did not emit this warning. The local Node 26
shutdown warning remains a test-runner follow-up, not a passed cleanup assumption.

Local runtime is Node 26.10.0; this entry does not claim Node 24 CI results.
Human task testing, physical passkeys, and real screen-reader tasks remain
unverified. Use the existing participant guide for those checks. No production
service operation, deployment, package publication, or release tag is authorized
or performed by this work.

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

## Web UI/UX review — 2026-10-22

Reviewed application revision `771509289771d1afb70697a3ed9993ae18c1d30a`.
The [per-node report](reviews/web-ui-ux-review.md) records 17 findings,
simplification proposals, evidence limits, and a separate
[participant procedure](reviews/web-ui-ux-participant-guide.md). No application
behavior or UI was changed.

Actual local verification with Node 26.10.0 and npm 11.19.1:

- `npm ci`: passed; both Prisma clients generated. Five existing dependency
  advisories remain (four high, one low).
- Initial `npm run test:ui`: all 53 existing tests passed in 4.1 minutes.
- Added `apps/web/e2e/ui-ux-review.spec.ts`; its four tests cover evidence
  collection, disposable participant-fixture provisioning/cleanup, and controlled
  bootstrap loading/failure/retry. They capture the pages in both locales at
  1440 × 900 and 390 × 844, plus active/paused, empty, non-owner, missing-record,
  and administrator states.
- Full `npm run test:ui`: all 57 tests passed in 6.0 minutes, with no skips or
  retries. A final focused four-test repeat passed in 2.1 minutes after the
  native-zoom screenshot correction. The audit collected 142 rendered samples
  and 28 additional 320-pixel width measurements. All 142 skip-to-main checks
  passed and selected axe checks reported no violations. Four separate captures
  cover bootstrap loading/error. This does not establish full WCAG compliance
  or first-time-user comprehension.
- Real Chrome Page zoom at 200% was verified for 36 samples using isolated
  persistent profiles, devicePixelRatio/viewport assertions, and direct CDP
  screenshots with a physical-width assertion. Initial preference-file and
  Playwright clipping attempts were corrected, not reported as successful final
  evidence. Zoom coverage does not include every state or administrator view.
- The opt-in participant configuration was listed through the safe UI runner;
  its fixture/login/cleanup was smoke-tested. No visible human session was run.
  Two independent visual-review subagents and one evidence-audit subagent
  contributed expert review, not participant data.
- The audit reproduced exercise filter selections being cleared by the other
  filter form. English populated Measurements measured 321 pixels at a
  320-pixel viewport. Neither finding was changed or reported as a usability pass.
- `npm run check`: Biome and all TypeScript checks passed.
- `npm test`: all 64 tests passed.
- `npm run test:api`: all 23 disposable SQLite HTTP tests passed, including
  server-side authentication, roles, ownership, and mutation-Origin checks.
- `npm run test:ui:production`: the build passed, but the browser suite did not
  start because the configured OrbStack Docker socket was unavailable. No
  production-mode browser pass is claimed. The engine was not started because
  that could start existing production services.
- The browser runner exited successfully and released ports 8784 and 8785.
  No review-date test database directories remain. Pre-existing temporary files
  were not removed. PNG/JSON evidence remains ignored under `test-results/`.

Human participant checks (sample size zero), physical passkeys, deliberate
passkey cancellation, a real screen-reader smoke check, complete zoom/reflow
state coverage, and the full per-page failure-state matrix remain open. The
active review plan is retained pending those checks or
explicit user acceptance of the documented limitations. No deployment, image
publication, release tag, or production operation was performed.

## Staged UI review snapshot verification — 2026-10-23

This branch submits the original staged review files against `origin/main` at
`724252e`. Seven staged files already match that base; five differ. The snapshot
retains the older audit probes and documentation instead of reconciling the
changes merged in PRs #23 and #24. Only this verification record and a new empty
changeset are added to the staged content. The original worktree is unchanged.

Actual checks in a separate worktree with Node 26.10.0 and npm 11.19.1:

- `npm ci`: passed; five existing dependency advisories remain.
- `npm run check`: passed, including Biome and all TypeScript checks.
- `npm run build`: passed; the Vite chunk-size warning remains.
- `npm test`: all 76 tests passed.
- `prek run -a`: Biome and TypeScript gates passed.
- `npm run test:ui -- ui-ux-review.spec.ts`: failed, with three passes and one
  failure. The signed-in audit timed out at line 475 because
  `.library-metadata-filters button[type=submit]` no longer exists. Its old
  filter-drop assertions also conflict with the merged filter-preservation
  contract. The test is retained unchanged for this snapshot review.
- Separate checks found no listeners on ports 8784 and 8785 after the runner
  exited. Generated output and browser artifacts are not included in the commit.
- Full browser, production-mode, API, and database suites were not rerun.

This snapshot removes later verification records and historical-scope notes
present on `main`. These differences require review; they are not accepted fixes.
Keep the PR draft while the audit failure and documentation differences remain
unresolved. Earlier passing results above do not verify this snapshot. No
application implementation, deployment, publication, or production operation is
included.

## UI/UX correctness fixes — 2026-10-23

This work resolves the seven findings from the subsequent source and browser
review. It does not replace the historical audit or its participant requirements.
No database model, migration, stored slug, or HTTP schema changes are required.

| Finding | Correction and regression evidence |
| --- | --- |
| Password truncation | New and changed passwords use versioned, domain-separated SHA-256/base64 plus bcrypt at cost 12. `apps/api/tests/password.test.ts` covers ASCII/UTF-8 suffix differences, salts, malformed formats, and legacy access. `password-auth.test.ts` covers account creation, suffix-only changes, rejection of the old password, and session revocation. The existing security browser workflow now tests a password longer than 72 UTF-8 bytes. |
| Unicode exercise names | Interactive creation separates normalized names from identifiers and retries a slug collision once with a UUID suffix. The seed/import slugifier and existing slugs stay unchanged. `exercise-names.test.ts`, `exercise-unicode.spec.ts`, and the existing import-rerun workflow cover Chinese/mixed names, duplicates, rename history, ownership, and repeat imports. |
| Text clearing | Update actions preserve omitted fields but persist explicit empty text. `recorded-workout-review.test.ts` and `.spec.ts` cover titles, workout notes, and set notes, including whitespace, repeated requests, reload, validation, and ownership. |
| Weight precision | Add-set and completed-set inputs accept 0.001 kg increments, matching live inputs. Browser regressions verify 50.25/50.251 kg saves, unchanged valid weights, failed-save drafts, and rejection of finer unsupported input precision. |
| Skipped sets | Completed-workout rows show the existing localized Skipped status without placeholder actuals or performed-value editors. Confirmed deletion remains available. Both locales and desktop/mobile widths verify performed-only totals, status, deletion cancellation, native validity, reflow, and axe checks. |
| Month-end trends | The environment-neutral month helper constructs each bucket on day 1. Five core regressions verify consecutive unique months, leap/year boundaries, exact volumes, empty buckets, and locale-independent keys. |
| Warm-up progression | The completion guard checks working sets only. Four HTTP cases cover ACTIVE/PAUSED states, warm-up acceptance, and atomic rejection after a working set is complete. The browser regression completes a warm-up, accepts the displayed suggestion, and verifies that only working targets change. |

### Actual checks

| Check | Result |
| --- | --- |
| `npm run check` | Passed: Biome and all TypeScript checks; repeated after the final code/test changes |
| `npm run build` | Passed; existing Vite chunk-size and dependency annotation warnings remain |
| `npm test` | 81 passed, no skips |
| `npm run test:api` | 82 passed with disposable SQLite, no skips |
| `npm run test:training:sqlite` | 15 passed, including legacy upgrade and recovery cases |
| `TZ=America/New_York node --test packages/core/tests/monthly-trend-review.test.mjs` | Five passed |
| Final browser integration subset | 17 passed in 3.5 minutes, no skips or retries |
| Final `security-feedback.spec.ts` repeat | 28 passed in 58.1 seconds, including the long UTF-8 password change |
| `prek run -a` | Passed: Biome and TypeScript |
| `npm run changeset -- status` | Valid; the new changeset requests API/core/web patch versions |
| `git diff --check` | Passed |
| Runner cleanup | No listeners on 8784/8785 after the final browser run |
| PostgreSQL and production HTTPS | Unavailable: the configured Docker daemon socket does not exist. No engine or production service was started; these checks are not passed |

The final 17-case command was:

```sh
npm run test:ui -- apps/web/e2e/ui.spec.ts apps/web/e2e/recorded-workout-review.spec.ts apps/web/e2e/exercise-unicode.spec.ts apps/web/e2e/progression-review.spec.ts apps/web/e2e/ui-ux-remediation.spec.ts apps/web/e2e/visual-dashboard.spec.ts
```

The separate security repeat used:

```sh
npm run test:ui -- apps/web/e2e/security-feedback.spec.ts
```

Earlier checks are not reclassified as passing. The first password regression
run reproduced truncation. An initial pure-suite run found the new calendar
helper missing from the root export; the export was added and all 81 tests passed.
The first new browser run had two passes and four ambiguous-login-selector
failures. A broader compatibility run then had 60 passes, one outdated 0.5 kg
validation assertion failure, and four serial cases not run. The tests now select
the password Sign in action explicitly, accept valid 0.001 kg precision, and
still reject finer increments. The final complete affected UI suite and new
regressions passed. Exercise edit/import, live session recovery, and roadmap
cases also passed in that compatibility run. The full browser suite, including
the previously documented staged audit, was not rerun or reported passed.

Read-only independent source review found no additional implementation defect.
It identified the existing raw-bcrypt browser assertion; this assertion now uses
the version-aware verifier and explicitly rejects a different long-password
suffix. No test assertion was removed to obtain a passing result.

Legacy hashes retain their original 72-byte verification limit until the user
changes the password. The discarded original suffix cannot be recovered. New
hashes are not readable by an older raw-bcrypt-only verifier; rollback builds
must retain the version-aware verifier. See [release recovery](releasing.md).
A package changeset records the user-visible fixes. Pull request preparation was
authorized after local verification. These checks did not deploy, publish,
operate production data, or change an unrelated plan.
