# Results UI/UX review and design plan

## Goal and baseline

Make recorded results easy to read before correction, and preserve context when
users inspect history, filter reports, or edit aliases.

Review date: 2026-10-28. Baseline: `0ce25f8`, after PR #30. Do not repeat that PR's
training-entry, ongoing-session, mobile-navigation, or live-session improvements.

Baseline checks passed: four recorded-workout regression cases, the dashboard
visual case, and one new results capture case. Local captures are under
`.cache/uiux-review-2/before/` and `.cache/uiux-review-2/results-before/`.
These are expert findings, not participant-test results.

## Findings

| ID | Current evidence | Proposed change | Acceptance |
| --- | --- | --- | --- |
| R1 | Desktop performed rows expose order, exercise, weight, reps, type, RIR, notes, Save, and Delete immediately. Type/RIR appear in the Notes column. Mobile hides RIR/notes inside correction tools. See `apps/web/src/pages/workout.tsx:284–630` and the completed-workout captures. | Use one responsive, read-first representation. Show exact saved actuals, type, RIR, and notes. Keep correction behind a native Update set disclosure. | No correction fields are visible before opening a row. Exact values, zero load, RIR zero, failed-save drafts, precision, clearing, deletion confirmation, and cross-breakpoint drafts remain correct. Skipped placeholders never appear as actuals. |
| R2 | Exercise history links to whole workouts but does not expose their individual sets, although the view already includes them. See `apps/web/src/pages/exercise.tsx:129–160`. | Add read-only set breakdowns to each history entry, with a separate workout link. | Opening/closing sends no mutation; only this user's completed sets for this exercise appear. Preserve order, exact actuals, warm-up/type/RIR/notes, and the workout link. |
| R3 | Six large summary cards precede exercise history. In the 390px capture, labels wrap into short fragments and the first history entry is near the viewport bottom. Max load is displayed as 50.3 for a saved 50.251 record. | Keep two compact working-set records visible. Put the four cumulative totals behind a clearly named disclosure. Use exact record values; leave aggregate calculation/rounding rules unchanged. | The first history entry is visible at 390 × 844. All six existing measures remain available, with explicit working-set scope, no fabricated empty records, and no clipped labels at 320px. |
| R4 | Calendar includes all workout states but receives performed sets only for completed workouts. Its selected-date card consequently claims No sets/zero metrics for active or paused work. See `apps/api/src/views.ts:233–250` and `apps/web/src/pages/calendar.tsx:202–236`. | Show performed summaries only for completed workouts. Use state-specific context and Continue training for active/paused sessions; do not invent unavailable metrics. | Mixed-state fixtures never label an ongoing session empty. Opening continuation does not resume or create a session. Completed metrics still exclude skipped sets. |
| R5 | Stats range, record scope, and consistency-year forms do not preserve all other selections. See `pages/stats.tsx:85–105`, `:607–628`, and `components/consistency-report.tsx:54–68` under `apps/web/src/`. | Preserve the independent range, records, and year selections across each submission. | Change each filter from a combined URL, then reload/Back/Forward. Other selections remain; invalid values retain safe defaults. |
| R6 | Radix Collapsible removes the alias form when closed, discarding uncontrolled drafts, pending guard, and feedback. See `apps/web/src/pages/exercises.tsx:257–302`. | Keep the form mounted with a native disclosure so existing validation/failure recovery can reveal it. | Closing/reopening preserves alias and locale. Closing during a delayed failed request retains draft, prevents duplicate writes, and reopens feedback. |

Focused baseline tests reproduced all three R4–R6 failures. Before evidence is
in `.cache/uiux-review-2/context-before-final.log` and
`context-before-{calendar,stats,alias}.png`. The corrected context workflows and
existing dashboard checks passed 10 cases before integrated verification. No schema, API response, authentication,
calculation, dependency, or production-service changes are required.

## Generated proposal

`codex_imagegen` generated `.cache/uiux-review-2/proposal.png` (1536 × 1024) from
synthetic content. The board was inspected before implementation.

The brief requested a desktop completed-workout view, mobile completed-workout
view, and mobile exercise history. It specified read-only saved rows, exact
50.251 kg and zero-load examples, explicit correction disclosures, skipped-state
safety, compact working-set records, secondary totals, and read-only history
breakdowns, within the existing neutral/white/teal Radix-compatible design.

Accepted: clear saved-result rows, explicit Update set controls, nearby notes/RIR,
compact records, and expandable exercise-specific sets.

Rejected: bottom navigation replacing PR #30's header, invented planned-rep
comparisons, kg-only volume units, edit actions for skipped rows, fabricated totals,
new reuse menus, and Add set appearing before the recorded results. Keep existing
navigation, actual calculations, volume units, and action order.

The board is a reference, not accessibility or usability evidence. Original bytes
and screenshots stay in ignored `.cache/uiux-review-2/`; no images are committed
or used by the app.

## Implementation plan

1. Share precise recorded-number/result presentation between workout rows and
   exercise-history breakdowns. Preserve supported imported numeric precision.
2. Replace duplicate desktop/mobile set editors with one responsive read-first
   list and native correction disclosures, retaining all mutation safeguards.
3. Add read-only exercise set details, compact working-set records, and secondary
   cumulative totals without an API change.
4. Correct Calendar's ongoing-state summaries, preserve Stats filter context, and
   retain alias forms/drafts across disclosure changes.
5. Add matching English/Traditional Chinese messages and focused regressions.
   Run check/build/pure tests, relevant HTTP tests, both browser modes, and the
   pre-commit gate; record actual evidence before opening a new PR.

## Implemented decisions

- Completed sets use one responsive DOM representation. Native correction forms
  remain mounted while closed, so resize, collapse, and failed responses do not
  discard drafts. Read-only values change only after a confirmed save.
- Workout rows and exercise breakdowns share exact recorded-number presentation.
  Pure tests include 50.251, 0.001, zero/negative zero, long accepted decimals,
  and 1e-21; aggregate formatting and calculations are unchanged.
- Exercise history exposes two working-set records with source dates and four
  cumulative totals in a disclosure. A warm-up-only history does not invent
  working-set records; foreign-only history remains empty and non-editable.
- Calendar no longer claims missing ongoing metrics are zero. Stats preserves
  canonical selections and updates controls on Back/Forward. Alias forms use
  mounted native disclosures with existing pending/error recovery.
- Existing tests now open correction disclosures, select the visible year field,
  check meaningful preserved query parameters, and scope scheduled-state checks
  to the schedule. Their value, precision, keyboard, and safety assertions remain.

## Recovery and external handoff

Revert the web changes together if recovery is needed. No migration or data reset
is required. Do not modify existing sessions, credentials, or workout records to
reverse presentation changes.

Product reviewers need a disposable account, a physical device, and a real screen
reader. Use the existing participant guide to check unassisted result reading,
correction, history drill-down, and filter/draft recovery. Expected results are
correct interpretation and successful task completion without data loss. These
human/device behaviors remain unverified by automated checks. No deployment or
release is authorized.

## Verification

Implementation, focused regressions, and independent code review are complete.
Check, build, 84 pure tests, and 83 HTTP tests on each database passed. Full
browser verification will use the existing Node 24 CI matrix after local Axe
evaluation timeouts under heavy host load. No full browser pass is claimed yet.
Actual command results and warnings are recorded in
`docs/hono-migration-verification.md`.
