# Web UI/UX remediation

## Scope and baseline

This work addresses review findings U01–U17. Implementation starts from
`origin/main` revision `62f05a8` on `narumi/fix/web-ui-ux-remediation`, in a separate
worktree. The original worktree's review, fixtures, plans, and verification edits
are preserved. Review artifacts copied for local comparison are not new PR work.
The newer base includes Connected agents and MCP consent routes; retain them.

Before application edits, `npm ci` passed. The disposable baseline command
`npm run test:ui -- apps/web/e2e/ui-ux-review.spec.ts apps/web/e2e/passkeys.spec.ts`
passed all six cases in 2.3 minutes. The runner exited normally; no listeners
remained on 8784/8785. Audit captures reproduce U06 filter resets, U08 missing-page
recovery, U12 generic feedback, U14 immediate removal, and U16 disabled styling.
These tests and source observations do not establish human usability.

At 320 CSS pixels, populated English Measurements had a 321-pixel document.
The table's intrinsic width propagated through the grid: table, cards, and H1
were 305.34375 pixels wide with right edge 321.34375. The fix must bound the grid
track and keep table scrolling local, not hide page overflow.

## Content outlines and verification matrix

These outlines define task order. A disclosure remains available to keyboard and
touch users; it must retain drafts and open when a linked edit/error requires it.

| Findings / screen | Before | Required after | States and checks |
| --- | --- | --- | --- |
| U01 / exercise detail | Metadata editor, name, rename, history | Name and compact tags, records/history, secondary editors | Owner/non-owner, empty/populated, duplicate/failed save, hash entry, identity |
| U02 / live workout | Session actions, optional inputs, equal Save/Complete | State, current actuals, primary Complete, secondary Save/detail | Active/paused/abandoned, zero weight, dirty draft, conflict, finish/abandon, keyboard |
| U03 / recorded workout | Training and edit tools before sets | Title/date, compact results, sets, Add set, secondary tools | Set add/edit/delete, repeat, copy, template, start |
| U04 / history/library | Summary/filter controls before useful rows | Visible search, useful rows or clear empty state, secondary analysis | Empty/populated/no results, filters, pagination, first viewport |
| U05 / templates | Start training inside weekly schedule | Existing start beside template; past logging remains distinct | Start, schedule, retrospective creation |
| U06 / exercise filters | Two forms discard criteria | One coherent query state | Change each of q/sort/muscle/equipment, reload, back/forward, clear |
| U07 / Source | Instructions without links | Named Repository/License links and license ID | Guest/signed-in, link targets and names |
| U08 / missing outcomes | Alert and ineffective retry | Heading, distinct message, local valid destination | Guest/user, missing/foreign exercise/workout, transient retry, 401 clearing |
| U09 / Measurements | Two Save forms and leading rules | Measurement entry, history/trend, target editor | Replacement note, distinct labels, validation, target clearing, failed saves |
| U10 / public and account | Repeated prose, competing methods/cross-links | Short purpose, labeled inputs, primary sign-in, secondary passkey, matching security navigation | Setup/login/new, requirements, password-manager attributes, security links |
| U10 / Calendar and Stats | Full notes, generic month labels, six metrics before trend | Contextual day action, state, note preview; range and useful trend before detail | Sunday-first dates, completed-only agenda, range/record scope, accessible chart values |
| U10, U16 / Data | Competing export/preview/confirm | Separate secondary export; file, review, confirm stages | No file, readable/unreadable/oversize file, invalid CSV, preview error, confirm failure, cancel, no-write, duplicates |
| U11 / administration | Raw roles; create form first | Localized role display, list, secondary creation | Guest/user/admin, create validation, stored role values unchanged |
| U13 / Measurements reflow | Intrinsic table expands page | Constrained grid; named local table scroll | Empty/populated/expanded edits, 320 CSS pixels and 200% zoom |
| U15 / metrics | Values without nearby units | kg load and localized kg × reps volume at point of use | Workout/exercise/Stats, warm-up/completed-set rules unchanged |
| U17 / target chart | Label drawn over data; unbounded scale | Bounded chart with reserved target-label area | Close-to-target, sparse, long labels, shared chart consumers |

For each changed rendered state, use English and Traditional Chinese at
1440 × 900 and 390 × 844. Check affected controls/disclosures at 320 CSS pixels
and real 200% browser zoom. Record actual viewport and native zoom; CSS transforms
and device scaling alone do not test browser zoom. Check focus order, keyboard,
axe, pending/validation/failure/recovery states. A successful automated inventory
is not a screen-reader or participant observation. A nonexistent state (for
example, read-only Source mutation feedback) is not applicable.

## U12 feedback decision

Keep the server password contract unchanged: `error=current` identifies a
current-password correction; `error=invalid` remains a safe generic fallback.
Use client mismatch validation with no mutation, visible length guidance, and
field associations. Never infer mismatch from every `invalid` outcome. Keep
server validation and session rotation. Passkey registration and authentication
use operation-specific recovery; an ambiguous browser refusal/timeout must not
be presented as a wrong password or a confirmed cancellation.

## Actual verification

| Check | Actual result |
| --- | --- |
| `npm run check` | Passed: Biome and all workspace/root TypeScript checks |
| `npm run build` | Passed; existing large Vite entry-chunk warning remains |
| `npm test` | 76 passed, no skips |
| `npm run test:api` | 62 passed with disposable SQLite |
| `npm run test:training:sqlite` | 15 passed |
| Security/filter focused browser run | 32 passed in 1.3 minutes after correcting pending accessible names |
| Exercise/Measurements/live-workflow focused browser run | 39 passed in 2.9 minutes |
| Integration subset (`ui.spec.ts` and `ui-ux-remediation.spec.ts`) | 10 passed in 2.5 minutes, including deferred-editor failure recovery |
| Matrix repeat (`ui-ux-remediation.spec.ts`) | Four passed in 1.4 minutes after adding both-locale opening history/library assertions and sparse/long-target zoom states |
| Final compatibility subset (`ux-findings.spec.ts` and `ui-ux-remediation.spec.ts`) | 25 passed in 2.4 minutes after preserving input Enter as Save-only |
| Final native-zoom repeat | One case passed in 41.5 seconds, with 38 native-200%-zoom samples including empty Measurements |
| Browser recovery follow-up | 32 cases passed in 2.3 minutes after adding direct unknown-URL assertions; the HTTP suite returned to 62/62 after its new recovery assertion first reproduced the plain-text defect |
| `npm run test:ui` | All 109 tests passed in 7.4 minutes, then all 109 passed in 7.7 minutes after the final Save-only Enter correction; no skips or retries |
| Local `npm run test:ui:production` | Build passed; browser runner blocked before tests because no Docker daemon was available |
| CI production HTTPS browser | All 109 passed in 7.8 minutes on `1957eac`, run `39831152427` |
| CI checks / databases / image smoke | Passed on `1957eac`; database-init 29, SQLite/PostgreSQL upgrades 15 each, PostgreSQL HTTP 62 |
| CI development browser | Still in Chrome dependency installation when this evidence was recorded; not reported passed |
| Public Repository and License link reachability | Both returned HTTP 200 |
| Runner cleanup | Final full-suite and focused runs returned zero; no listeners on 8784/8785 or runner-owned supervisor remained |
| `prek run -a` | Passed: Biome and TypeScript; repeated before the implementation commit |

The full browser suite uses only PR files. The 7.7-minute repeat includes the
final keyboard and zoom fixtures. A later bounded server correction for direct
unknown browser URLs passed its HTTP and focused-browser checks; current-source
production/development PR CI results are recorded separately. The source-verifying
[CI run](https://github.com/narumiruna/fitness/actions/runs/39831152427) tests
implementation revision `1957eacd390fda80c1272de4c5826998091e02ac`. Input Enter remains
Save-only; the visually primary Complete set requires its explicit action.
Earlier local runs also included the
supplied, uncommitted review audit. Those context copies are excluded from the PR
and from the final full-suite count. The standalone exercise-filter regression
asserts the corrected contract rather than importing the old defect probes.

Earlier failures are retained as evidence:

- The first security subset had six failures: pending Radix buttons had duplicated
  accessible names, and concurrent package builds restarted the development API.
  Explicit action names and serialized build/browser execution corrected these;
  the stable repeat passed all 32 cases.
- The first full development run had 104 passes, three failures, and four tests
  not run because of serial dependencies. Failures were old visible-summary,
  destructive-button-background, and exercise-submit selector assumptions. Tests
  now check the retained focus, intentional collapsed summary, red destructive
  text, and actual Search action. No retry/skip or behavior assertion was removed.
- Integration then found an insufficient-contrast Cancel button in expanded
  Measurements and a mobile delete editor that the test had not opened. Added
  Radix high-contrast styling and explicit disclosure interaction; all ten cases
  passed in the repeat.
- The first API run failed a pre-existing test that assumes the checkout basename
  is `fitness`. Moving the isolated checkout to a directory named `fitness`
  allowed all 62 cases to pass without changing or weakening that test.
- One focused workflow shutdown logged an existing macOS `kill EPERM` warning.
  That run returned zero; separate listener/process checks found no remaining
  runner-owned listeners or supervisor. This warning is not a cleanup assertion.

Local artifacts are ignored under `test-results/`. The real-zoom test records
actual CSS viewport dimensions and devicePixelRatio 2 in `zoom-evidence.json`.
It changes Chrome Page zoom in an isolated profile, verifies physical PNG width
through CDP, and removes that profile afterward. Expanded measurement edits,
owner metadata, active/paused sessions, import preview/error, populated passkeys,
and administration are included in both locales. This is browser automation,
not assistive-technology or participant evidence.

## Finding resolution

The implementation is present for every finding. Human validation and the
external gates below remain open; “implemented” does not mean comprehension or
full accessibility compliance is proved.

| ID | Main changed files (web source unless qualified) | Browser regression evidence under `apps/web/e2e/` |
| --- | --- | --- |
| U01 | `pages/exercise.tsx`, `components/exercise-metadata.tsx` | `exercise-edit.spec.ts`: identity/history order, owner/shared states, hashes, duplicate and failed-save draft retention |
| U02 | `components/session-panel.tsx`, `session-controls.tsx` | `ux-findings.spec.ts`: current action, Save-only, zero actuals, pause/resume, conflict, finish/abandon; `ui-ux-remediation.spec.ts`: hidden invalid input and pending-close failure recovery |
| U03 | `pages/workout.tsx` | `ux-findings.spec.ts` and `ui.spec.ts`: recorded sets first, set mutations, repeat, copying, templates, separate training |
| U04 | `pages/workouts.tsx`, `pages/exercises.tsx`, `styles.css` | `exercise-filters.spec.ts`, `ui.spec.ts`, `ux-findings.spec.ts`: visible search, collapsed optional controls, URL state, all-time totals and pagination. Header/navigation were retained; content reordering is the selected correction |
| U05 | `pages/workouts.tsx`, `components/template-planning.tsx` | `ui-roadmap.spec.ts`: Start training from template while schedule is closed; past-workout logging and scheduling retained |
| U06 | `pages/exercises.tsx` | `exercise-filters.spec.ts`: all four criteria, URL/controls/results, reload, back/forward, clear and both locales |
| U07 | `pages/source.tsx`, both dictionaries | `security-feedback.spec.ts`: named links for guest/user and both locales/viewports; public HTTP 200 checks |
| U08 | `app.tsx`, `components/page-error.tsx`; `apps/api/src/server.ts` | `security-feedback.spec.ts`, `api-client.spec.ts`: distinct 403/404, unknown/missing/foreign resources, transient retry, 401 clearing, keyboard focus |
| U09 | `pages/measurements.tsx`, both dictionaries | `measurements.spec.ts`: distinct actions, replacement, validation, drafts, target clearing and deletion cancellation |
| U10 | Public/account/calendar/stats/data pages; `components/data-import.tsx` | `ui.spec.ts`, `ui-roadmap.spec.ts`, `security-feedback.spec.ts`, `ui-ux-remediation.spec.ts`: existing tasks and reduced hierarchy, including import stages and security navigation |
| U11 | `pages/users.tsx`, both dictionaries | `ui.spec.ts`, `ui-ux-remediation.spec.ts`: list-first outline, localized roles, unchanged stored roles and list/create-only operations |
| U12 | `pages/password.tsx`, `components/passkey-form.tsx`, both dictionaries | `security-feedback.spec.ts`, `passkeys.spec.ts`: visible guidance, safe current-password mapping, client mismatch/no write, operation-specific feedback, unsupported/refused/failed requests and successful change |
| U13 | `pages/measurements.tsx`, `styles.css` | `measurements.spec.ts`: empty/populated/expanded edits at 320, named keyboard scroll; `ui-ux-remediation.spec.ts`: native 200% zoom |
| U14 | `pages/passkeys.tsx`, `components/confirm-delete.tsx` | `passkeys.spec.ts`, `security-feedback.spec.ts`: named confirmation, Cancel/Escape, focus, failure, pending duplicate prevention, one removal and surviving focus |
| U15 | Workout/exercise/Stats pages, both dictionaries | Point-of-use unit assertions plus unchanged pure metric fixtures and browser count/scope checks |
| U16 | `styles.css`, `components/data-import.tsx` | Disabled state, readable file/pending/preview transitions, no-write cancellation, failed-confirmation retry, duplicate import and isolation assertions; explicit destructive color regression |
| U17 | `components/training-chart.tsx`, Measurements styles | `measurements.spec.ts`: close/sparse/long-value fixtures, reserved label outside plot, dashed line and data alternative; Stats line/bar consumer checks |

## Scripted journey evidence

These are reproducible test walkthroughs, not unassisted participant outcomes.

1. **First-run logging:** [`ui.spec.ts`](../../apps/web/e2e/ui.spec.ts), setup and
   all-workout-forms cases: create the first administrator → enter empty Workouts
   → create an exercise/alias → create and edit a retrospective workout → add and
   correct sets → open Calendar → inspect Stats and ranges. Native required-field
   validation, date prefills, stored values, and account isolation are asserted.
2. **Returning training:** [`ui-roadmap.spec.ts`](../../apps/web/e2e/ui-roadmap.spec.ts),
   roadmap and zero-actuals cases, plus
   [`ux-findings.spec.ts`](../../apps/web/e2e/ux-findings.spec.ts): use the template's
   Start training while weekly scheduling stays closed → enter actual values
   (including zero weight) → save or explicitly complete → pause/resume → finish
   or abandon with the required safeguard → verify history and progress. Input
   Enter remains Save-only; an explicit Complete action carries its submitter.
3. **Recovery:** [`security-feedback.spec.ts`](../../apps/web/e2e/security-feedback.spec.ts)
   and [`api-client.spec.ts`](../../apps/web/e2e/api-client.spec.ts): expired session
   clears private state; permanent missing/forbidden outcomes offer navigation;
   transient reads recover through retry. Failed-save, conflict-refresh, and
   lost-response creation cases in `ux-findings.spec.ts` retain drafts and do not
   repeat committed writes. [`ui-ux-remediation.spec.ts`](../../apps/web/e2e/ui-ux-remediation.spec.ts)
   verifies pending-close disclosure failures, hidden invalid-input focus,
   read-only preview/cancel, failed confirmation, and duplicate import recovery.
   [`passkeys.spec.ts`](../../apps/web/e2e/passkeys.spec.ts) verifies deliberate app
   confirmation cancellation and one removal with a virtual authenticator; this
   is not a real browser-dialog dismissal or physical-device result.

## Review and recovery

Independent source review covered correctness, security, lifecycle safety,
compatibility, regressions, and scope. It found a hidden-save-failure risk when a
user closes a new disclosure while a request is pending. A shared
`revealDisclosures` helper now opens ancestor disclosures on native validation
and failed saves in both form components. Success does not reopen them or repeat
a write. Delayed-failure tests cover live sets, workout editing, template saving,
and target saving in both locales; invalid hidden RIR becomes visible and focused
without sending a request.

Expert screenshot inspection confirmed a useful Stats trend before overview
cards, a distinct disabled Preview, and readable expanded measurement controls
at native zoom. These are expert observations, not participant results.

No JSON API contract, schema, calculation, dependency, stored role, or supported
account operation changed. Server authorization and mutation Origin checks remain the
boundary. MCP consent/Connected agents routes and password recovery advice remain.
A production-boundary check found that direct unknown browser URLs returned plain
text before React could render recovery. A new HTTP assertion reproduced this
(61 passes, one failure). `apps/api/src/server.ts` now serves the existing shell
with status **404** for extensionless unknown browser paths requesting HTML.
API, asset, MCP/OAuth, well-known, file-like, non-HTML, and traversal failures stay
isolated. GET/HEAD, status, body type, no-store, and boundary assertions pass in
all 62 HTTP cases. This adds no application route or JSON schema. PR production
HTTPS tests verify the rendered behavior; local Docker remains unavailable.
A separate read-only review found no issue in the fallback, status/cache handling,
GET/HEAD semantics, or retained machine/asset/traversal boundaries.

Revert page/component, server fallback, message, and matching test changes together
if a regression is found; no database restore or migration is needed. No production service was
operated, release workflow dispatched, package published, or version tag created.

## External gates

- Five unfamiliar participants and actual per-screen/unassisted-task results are
  not available. No one-second comprehension pass is claimed.
- Real screen-reader task completion and physical-device passkey registration,
  authentication, and deliberate dialog dismissal remain unperformed.
- Production HTTPS verification passed in the isolated CI environment on the
  implementation revision above. Local Docker is still unavailable; no engine
  or production service was started. Development CI was still installing Chrome
  when recorded, and remains an unverified remote check.
- User acceptance of the result and each remaining limit is pending.

These are open requirements, not waived checks. Keep the implementation PR draft
until required evidence is supplied or the user explicitly accepts each limit.
