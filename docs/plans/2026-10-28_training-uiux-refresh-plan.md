# Training UI/UX refresh plan

## Goal

Make starting, continuing, and recording training easier without changing workout
rules or removing existing tasks. Review the current UI, use `codex-imagegen` to
prepare a visual proposal, implement the selected direction, verify it, and open
a new pull request.

## Context

- Baseline: `cca619b`; branch: `narumi/feat/training-uiux`.
- Findings and generation brief: [Training UI/UX review](../reviews/training-uiux-refresh.md).
- Current status: implementation and verification complete; PR publication is in progress.
- Proposal: `.cache/uiux-refresh/proposal.png`, generated with `codex_imagegen`
  on 2026-10-28 (1536 × 1024). Docker is available for isolated production-mode tests.
- Existing remediation already makes recorded results and current-set completion
  primary. Preserve those changes instead of treating historical findings as
  current defects.

## Architecture

- `apps/web`: Radix navigation, compact training entry, selected-template setup,
  session presentation, responsive styles, dictionaries, and browser tests.
- `apps/api/src/views.ts`: independently read the signed-in user's active/paused
  sessions. Do not derive this list from filtered history or add mutation logic.
- `packages/contracts/src/index.ts`: add the typed ongoing-session summary to the
  workouts view. Keep response fields limited to the rendered requirement.
- `packages/core`, Prisma schema, migrations, authentication, production Compose,
  and deployment remain unchanged.

## Plan

- [x] Review current components and capture the existing dashboard at 1440, 768,
  and 390 pixels; record source-backed findings. Evidence: the isolated
  `visual-dashboard.spec.ts` case passed and produced 24 local captures.
- [x] Generate the proposal with `codex_imagegen` using the review brief; inspect
  it and record its path and selected decisions in the review. Evidence: the
  generated board was read and the accepted/rejected details are recorded.
- [x] Add the owner-scoped ongoing-session summary to the workouts view and HTTP
  schema; prove an older paused session remains available under unrelated
  history filters and page 2, without exposing another user's records.
- [x] Implement compact mobile navigation with Radix controls; retain all six
  destinations, account/admin access, sign-out, locale selection, nested active
  state, skip navigation, route focus, and keyboard focus return. Verify a closed
  header of at most 120 pixels at 320/390 pixels in both locales and roles.
- [x] Add compact training entry and selected-template setup before history;
  remove duplicated template start forms from the sidebar. Verify that selecting
  a source does not mutate data and that explicit start retains existing date,
  rest duration, draft, validation, and idempotency behavior. Keep retrospective
  logging and scheduling separate, and keep the first history result in the
  390 × 844 viewport with one ongoing session.
- [x] Place session progress, rest status, and Pause near the current-set form;
  keep Complete set primary and Save/Finish/Abandon secondary. Verify long
  sessions, zero weight, Enter intent, dirty drafts, conflicts, pause/resume,
  partial finish, and abandonment with existing and added browser tests.
- [x] Consolidate only affected CSS and add matching typed English/Traditional
  Chinese messages; verify 320/390/768/1440-pixel reflow, long labels, visible
  focus, axe, real 200% browser zoom, and unchanged destructive-button colors.
- [x] Run `npm run check`, `npm test`, `npm run build`, `npm run test:api`, and
  `npm run test:ui`; record actual results and before/after artifact paths in
  `docs/hono-migration-verification.md`. Use disposable data, refuse server reuse,
  and verify ports 8784/8785 are free afterward.
- [x] Run `npm run test:ui:production` with an available isolated Docker test
  environment; record the actual result. Do not start an engine that could start
  production services, stop an existing service, or report an unavailable run as
  passed. Keep this gate open if its environment is unavailable.
- [ ] Add a web package changeset, review the intended diff, run `prek run -a`,
  and open a new PR with verified results and limitations. Stage explicit paths
  only; do not include screenshots, generated output, databases, caches, or data.

## Completion Checklist

- [x] The review records a real `codex-imagegen` proposal and its design decisions.
- [x] The training journey meets the measurable acceptance checks above in both
  supported locales, without changing authorization or training calculations.
- [x] Required verification passes, or the user explicitly authorizes an exception
  for an unavailable mandatory gate; unavailable checks remain identified.
- [x] The retained review and verification documents contain the outcome and any
  external handoff before this completed execution plan is removed.
- [ ] The implementation is available in a new PR; no deployment or release ran.

## Rollback / Recovery

Revert the web, API view, and contract changes together. No database migration or
reset is required; preserve existing sessions and credentials.

## External Handoff

Product reviewers can use the existing participant guide for subjective usability
acceptance, physical-device checks, and real screen-reader tasks after the PR.
Automated evidence does not verify those behaviors. They are not substitutes for
the required code and browser gates, and no production release is authorized.
