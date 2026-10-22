# Web UI/UX remediation plan

## Goal

Resolve findings U01–U17 from the supplied Web UI/UX review
(`docs/reviews/web-ui-ux-review.md`, preserved local review work). Use the
[remediation record](../reviews/web-ui-ux-remediation.md) for implementation,
finding-resolution evidence, and remaining gates.
Make each screen's purpose and next action clear through content order, grouping,
and action emphasis. Preserve existing workflows, accessible controls, data rules,
and the Radix theme. Verify behavior and visual changes separately from human
comprehension.

Implementation was authorized by the user on 2026-10-22. Execution evidence is
recorded in `docs/reviews/web-ui-ux-remediation.md`. Human and physical-device
checks remain open; automated results do not substitute for them. The supplied review plan (`docs/plans/2026-10-22_web-ui-ux-review-plan.md`)
remains separate local work and open; this plan does not complete its outstanding checks or accept its limits.

## Context

- The review covers revision `771509289771d1afb70697a3ed9993ae18c1d30a` and records
  17 findings: 12 Medium and five Low. No Critical or High defect was established.
- Rendered observations and expert judgments support the design findings. U06
  also has a reproduced filter-state defect. No participant comprehension pass,
  real screen-reader result, or physical-device passkey result is available.
- Follow [Dashboard UI](../dashboard-ui.md) and its existing metric, date,
  pagination, authorization, and failure-recovery rules.
- `apps/web/src/pages/` owns page composition. Shared controls are in
  `apps/web/src/components/`; theme rules are in `apps/web/src/styles.css`.
  English and Traditional Chinese dictionaries are `messages.ts` and
  `messages-zh-tw.ts` under `apps/web/src/lib/`.
- `apps/web/e2e/ui-ux-review.spec.ts` currently asserts that exercise submissions
  drop filters. Replace those defect assertions when U06 is fixed; do not retain
  them as the desired contract or remove coverage merely to pass the suite.
- Existing review files, fixtures, tests, and verification documentation have
  local changes. Preserve unrelated work and establish the execution baseline
  before editing. Do not stage or overwrite another task's changes.

## Boundaries

- Keep changes in the web app unless contextual security feedback requires a
  small server-boundary correction. U08 needs a bounded production HTML-404
  fallback so a direct unknown browser URL can render the existing recovery
  screen. Keep status 404, non-HTML/API/machine/asset/traversal boundaries, and
  no-store behavior; `apps/api/tests/static.test.ts` supplies HTTP evidence.
  Preserve strict TypeScript and existing
  app-to-package dependency direction.
- Reuse Radix Themes, existing disclosures, `ConfirmDelete`, `ActionForm`, and
  `SubmitButton`. Do not add a design system, routes, dependencies, or settings.
- Do not change database schemas, calculations, supported account operations,
  passkey policy, stored role values, authentication, or ownership rules.
- Keep retrospective logging distinct from live training. Do not select an
  app-wide preferred workflow without user evidence.
- Use disposable synthetic data. Do not operate production Compose services,
  deploy, publish, tag releases, or start an existing Docker engine to run tests.
- Do not commit screenshots, traces, generated files, databases, or private data.

## Plan

Execute sections in order. Keep tightly coupled changes in one section together;
run its focused checks before the next section. Owners remain unassigned until
implementation starts.

### 1. Confirm the baseline and resolve material unknowns

- [x] Record the execution revision and working-tree boundaries; reproduce U06,
  U08, U12, U14, and U16 through the safe browser runner and identify affected
  assertions. Evidence: a remediation verification section in the review report
  names actual commands, outcomes, and runner cleanup, without replacing the
  original review evidence.
- [x] Identify the overflowing Measurements element for U13 at 320 CSS pixels,
  including expanded row editing; inspect U17 target-label bounds and every
  consumer of `TrainingChart` and the solid-button override. Evidence: measured
  element bounds and a bounded fix scope before CSS changes; no overflow-hiding
  workaround.
- [x] Confirm the smallest feedback correction for U12. The API currently sends
  `error=invalid` or `error=current` from `apps/api/src/actions/auth.ts`, while
  `pages/password.tsx` displays one message. The schema in
  `apps/api/src/lib/validation.ts` combines invalid fields and mismatch.
  Evidence: a selected approach that gives field-specific mismatch feedback,
  maps incorrect-current-password safely, and retains server validation. If a
  new server outcome is necessary, document it and add HTTP regression coverage;
  do not infer a mismatch from every `invalid` result.
- [x] Define a before/after content outline for every changed page/state and
  freeze the verification matrix. Use both locales at 1440 × 900 and 390 × 844;
  add 320-pixel reflow and real 200% zoom for affected controls and disclosures.
  Include empty/populated history, owner/non-owner exercise, completed/active/
  paused workouts, import preview/error, populated passkeys, and administration.
  Evidence: named fixtures, expected task order, and applicable pending,
  validation, failure, and recovery checks; mark inapplicable states with reasons.

### 2. Correct filter state and security/recovery feedback

- [x] **U06:** Combine exercise search, sort, muscle, and equipment into one
  coherent query form in `pages/exercises.tsx`. Keep search visible; use visible
  metadata labels or distinct defaults. Preserve all four values on submission,
  reload, and browser back/forward, with explicit clear behavior. Evidence:
  regression tests change each criterion independently and assert URL, selected
  controls, and results; update the audit's two filter-drop probes to the new
  contract without changing the historical observation in the report.
- [x] **U14:** Replace direct passkey deletion in `pages/passkeys.tsx` with the
  existing named confirmation pattern. Evidence: `passkeys.spec.ts` verifies the
  named key, Cancel and Escape cause no write, cancellation restores trigger
  focus, confirmation sends one removal, and pending/failure states retain a
  clear outcome and password recovery advice. After removal, move focus to a
  surviving logical control if the trigger no longer exists.
- [ ] **U08:** Give `MissingPage` and permanent 403/404 outcomes in `app.tsx` a
  localized H1 and named local recovery link. Use Sign in for guests and Back to
  workouts for signed-in users. Keep forbidden and missing messages distinct,
  retry for transient read failures, and the existing 401 private-state clearing.
  Inspect `components/page-error.tsx` for consistent transient recovery.
  Evidence: guest/signed-in unknown-route and missing/foreign-record tests,
  transient retry, 401 behavior, route focus, keyboard, and screen-reader checks.
- [ ] **U12:** Apply the selected password-feedback correction and split
  `components/passkey-form.tsx` feedback by registration/authentication and
  supported outcomes. Associate visible password requirements and correction
  text with the relevant fields. Do not claim to distinguish browser cancellation
  from timeout where WebAuthn provides an ambiguous error. Evidence: mismatch,
  wrong-current-password, short-password, successful change, unsupported-device,
  registration failure, authentication failure, and deliberate browser-dismissal
  checks; sign-in feedback never refers to a nonexistent password field or logs
  raw errors, secrets, or account-discovery details.

### 3. Put exercise identity and workout tasks first

- [x] **U01; U10 exercise empty state:** Reorder `pages/exercise.tsx` and
  `components/exercise-metadata.tsx` to name/compact metadata → records/history
  → secondary name/metadata editors. Replace empty numerical card grids with a
  concise empty-history state. Evidence: H1 precedes metadata in DOM and visual
  order for all roles; owner/non-owner and both locales retain aliases,
  identity, edit permissions, duplicate feedback, dirty input, and disclosure
  state after failed saves. Existing edit/hash links still open the right editor.
- [x] **U03:** Reorder completed `pages/workout.tsx` to title/date → compact
  recorded results and sets → Add set → secondary edit/repeat/template/training
  controls. Evidence: configuration no longer precedes recorded sets; add,
  edit, delete cancellation/confirmation, previous-session copying, repeat,
  template saving, and starting a new session retain their existing contracts.
- [ ] **U02:** Rework active/paused content in `components/session-panel.tsx`
  and related session controls to state → current-set actual weight/reps →
  dominant Complete set, with Save secondary and optional RIR/notes deferred.
  Keep Resume dominant when paused; retain other sets and session controls.
  Evidence: one clearly emphasized current action, keyboard/touch access,
  save-only behavior, zero-weight values, draft retention, conflict recovery,
  pause/resume, finish/skipped sets, and abandon confirmation pass. Abandoned
  workouts never expose resume behavior; participants later test discoverability.
- [x] **U15:** Add concise localized point-of-use units to workout, exercise,
  and Stats load/volume values. Use kg for load and kg × reps for volume;
  retain accessible definitions. Evidence: both locales show self-contained
  labels without changing totals, completed-set scope, warm-up rules, record
  dates, or existing metric-test results.

### 4. Make history and template actions easier to find

- [x] **U04; U10 workout empty state:** Reorder `pages/workouts.tsx` and the
  exercise library to visible search/current context → useful results or clear
  empty state → secondary filters/summary detail. Keep active filters visible
  and clearable when their controls are collapsed; avoid repeated result counts
  and introductions. Evidence: the populated mobile fixtures show a recognizable
  history/library item in the opening viewport, empty/no-results views have a
  clear next action, and filter URL state, 20-row pagination, user-scoped totals,
  and all-time summary semantics remain correct in both locales.
- [x] **U05:** Move the existing template `StartSessionForm` from schedule
  configuration to its template context in `pages/workouts.tsx` and
  `components/template-planning.tsx`. Keep retrospective creation separately
  labeled; leave scheduling/progression secondary. Evidence: update
  `ui-roadmap.spec.ts` to start training without opening Weekly template schedule,
  while schedule editing and past-workout creation still work.
- [x] **U04 shell decision:** Recheck the shared header only after the content
  changes. Keep its existing layout if the mobile acceptance above passes.
  Otherwise make the smallest verified spacing/layout change in `app.tsx`,
  `components/navigation.tsx`, and CSS. Evidence: both locales retain all six
  labeled destinations, utility/account/language access, active/nested state,
  skip link, focus visibility, and usable touch targets. Record a no-change
  decision if content reordering is sufficient.

### 5. Correct Measurements hierarchy, reflow, and chart labels

- [x] **U09:** Reorder `pages/measurements.tsx` to measurement input →
  history/trend → secondary target editor. Use distinct Save measurement and
  Save target labels, and put same-date replacement guidance beside the date.
  Evidence: localized visible/accessibility names, validation and retained
  drafts, same-date replacement, deletion cancellation, saved-value reload,
  and clearing a target without changing measurement history.
- [x] **U13:** Fix the measured sizing defect without clipping content or
  disabling zoom. Keep necessary table scrolling local and accessibly named.
  Evidence: populated, empty, and expanded-edit Measurements in both locales
  have document width no greater than viewport at 320 CSS pixels and real 200%
  zoom; users can reach all values, edit controls, and save/cancel actions.
- [x] **U17:** Bound Measurements form/chart width and put the target label in
  reserved space that cannot cover the plotted values or axes. Keep the dashed
  target distinction and accessible chart-data alternative. Evidence:
  close-to-target, sparse, and long-label fixtures at desktop/mobile and real
  200% zoom show no collisions or clipped values; history remains reachable.
  Recheck every `components/training-chart.tsx` consumer if shared geometry or
  CSS changes.

### 6. Simplify supporting screens and shared action states

- [x] **U07:** Replace indirect Source prose in `pages/source.tsx` with
  accessible Repository and License links, using the repository metadata and
  the actual LICENSE path. Retain the license identifier. Evidence: both links
  resolve to the intended public material for guests and signed-in users in
  both locales; link purpose is clear without extra instructions.
- [x] **U10 public/forms/account:** Remove only repeated introductions in
  setup, workout creation, and empty states; make the login alternative
  visually secondary without hiding it; use the same two-item security
  navigation on Password and Passkeys. Evidence: approved content outlines,
  password-manager attributes, labels, requirements, validation, recovery text,
  both sign-in methods, and direct security-page navigation remain usable.
- [x] **U10 Calendar/Stats:** Shorten calendar notes with full notes available
  in workout details; show session state, keep selected-date creation clear,
  and use month-specific Chinese navigation labels. Preserve the completed-only
  agenda, Sunday-first grid, local dates, and selected-day ordering. Put a useful
  trend and compact summary before optional Stats breakdowns. Evidence: calendar
  date/month/year-boundary tests, keyboard markers, URL range/reload tests,
  all-time record scope, and accessible non-hover chart values still pass.
- [x] **U10 Data; U16:** Separate export from the import file → preview →
  confirm flow in `pages/data.tsx` and `components/data-import.tsx`. Keep one
  dominant next import action per stage. Correct the shared solid-button rule
  in `styles.css` so Radix disabled/pending styling is not overridden. Evidence:
  no-file Preview is visibly and semantically disabled; selecting a valid
  readable fixture enables it; preview/error/confirm/cancel remain clear in both
  locales. Cancel/preview cause no write, duplicate handling and export isolation
  pass, and every control affected by the shared override retains readable
  labels, focus behavior, and duplicate-submit guards.
- [x] **U11:** Localize displayed USER/ADMIN labels in `pages/users.tsx` with
  matching dictionary keys; keep stored values unchanged. Use list → secondary
  Create user if the content-outline review confirms list inspection as the
  default task; record that decision. Evidence: both locales, administrator
  create/list validation, and guest/regular-user isolation pass; no password
  reset, role-edit, or delete feature is added.

### 7. Verify the combined changes and obtain acceptance

Execution status: implementation and automated checks are verified. Final CI
run `39836492319` on application/test source `f116c45` passed all five jobs,
including 109 development and 109 production HTTPS browser cases without skips
or retries. Earlier failed synchronization checks remain in the remediation
record; their corrections also passed 69 controlled stress cases. Local Docker
remains unavailable, but production verification passed in isolated CI.

U02 participant evidence, U08 screen-reader operation, U12 physical/browser-dialog
dismissal, complete manual state coverage, and user acceptance remain open. A
draft PR is the handoff, not plan completion. Do not delete this plan or treat
modeled browser errors as a real dialog-dismissal result.

- [ ] Complete the frozen affected-state matrix with real observations: both
  main viewports/locales, 320-pixel reflow, real 200% zoom, keyboard order/focus,
  axe, pending/failure feedback, and draft/no-duplicate-write recovery. Include
  the previously missing populated passkey list, missing exercise, expanded
  measurement edits, import preview/error, and administrator states. Evidence:
  assertions plus reproducible manual observations and ignored local artifact
  references; source inspection alone is not a rendered or assistive check.
- [x] Run `npm run check`, `npm run build`, `npm test`, and focused browser specs
  after their sections; then run the complete `npm run test:ui`. Run
  `npm run test:api` if server outcomes change. Run browser commands through the
  root runner on port 8784, refuse reuse, and confirm cleanup of its own
  processes/data. Evidence: actual command results in the remediation section
  of the report and `docs/hono-migration-verification.md`; historical review
  passes do not verify the fixes.
- [x] Run `npm run test:ui:production` only with an already available, isolated
  PostgreSQL/HTTPS test environment. If Docker is unavailable, record the
  blocked check and the environment needed; never report it passed or operate
  production to unblock it. Evidence: new production-mode results or explicit
  user acceptance of this particular validation limit.
- [ ] Perform a real screen-reader task smoke check and a physical-device
  passkey session, including deliberate dialog dismissal. Evidence: device,
  browser, assistive technology, tested task, and actual outcome; distinguish
  virtual-authenticator results. Leave unavailable checks blocked until they
  are performed or individually accepted by the user.
- [ ] Apply the supplied participant guide
  (`docs/reviews/web-ui-ux-participant-guide.md`, preserved local review work)
  to the revised screens with at least five unfamiliar participants. Use fresh
  participants or disclose prior exposure; include both locales and mobile/
  desktop, and report sample sizes per context. Evidence: actual anonymized
  answers and unassisted tasks, with at least four of five recognizing purpose/
  action per tested core screen and completing each core task without guidance
  or critical error. Do not substitute expert/model answers or automation.
  Iterate failed designs or obtain explicit acceptance of each failed target or
  unavailable check; do not claim an untested context passed.
- [x] Add a finding-resolution table for U01–U17 to the review report with
  changed files, regression/manual evidence, and any accepted residual risk.
  Include linked first-run, returning-user, and recovery walkthroughs. Add a
  package changeset for user-visible fixes, update affected UI documentation,
  and run `prek run -a` before committing. Evidence: scoped diff, changeset,
  verification record, and no unrelated/generated/binary files staged.

## Rollback / Recovery

These changes require no data migration. Keep each section reviewable and revert
its code, message, and test changes together if a regression is found. If U12
changes a server error outcome, keep legacy outcomes safely handled and verify
both sides before release; revert the server/client correction together if
needed. Do not restore a database or deploy as part of this plan. If a shared CSS
or chart change affects unrelated consumers, narrow or revert that change before
continuing.

## Completion Checklist

- [ ] U01–U17 each meet their linked acceptance criteria, with evidence and no
  unexplained omission; any residual risk has explicit user acceptance.
- [ ] All applicable automated and manual gates above have new results;
  unavailable checks remain blocked unless the user explicitly accepts each
  limitation. No passing claim relies on old evidence, skips, or unperformed work.
- [ ] Human results meet the per-screen and per-task targets, or the user
  explicitly accepts each failed target/validation limitation without a claim
  of proven one-second comprehension.
- [ ] Existing workflows, localization parity, accessibility, security, and
  metric/date semantics are preserved; changesets and verification records are
  complete. No production operation or deployment occurred.
- [ ] Obtain user acceptance of the remediation and remaining limits; then
  delete this completed plan. Do not delete or close the separate review plan
  unless its own completion conditions have also been satisfied.
