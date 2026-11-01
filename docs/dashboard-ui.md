# Dashboard UI

## Structure

- Workouts: compact training entry, independently loaded ongoing sessions, selected-template setup, month-grouped history, session-state badges, prescribed/completed progress, continue links, filters, user-scoped totals, exercise previews, focused creation at `/workouts/new`, and templates. Keep 20-row pagination and title/notes search semantics. Filters and pagination affect history, not all-time summary totals.
- Calendar: Sunday-first, 42-cell month grid, local-date selection, selected-day workouts, selected-date creation, and month agenda. Narrow screens show the selected date before the agenda. Markers retain accessible names and detail links.
- Stats: URL-based ranges, daily volume, Sunday-start weekly counts, exercise distribution, exercise volume, and personal records. Detailed totals and comparisons remain available without replacing the compact overview.
- Exercises: shared library, localized-name/normalized-alias search, name and personal-use sorting, aliases, creation, metadata filters, and personal recent-use dates. Exercise detail shows compact working-set records, secondary all-time totals, and read-only performed-set breakdowns for each history entry. Usage counts, records, and dates exclude other users' workouts.

Components live in `apps/web/src/components/`; pages live in `apps/web/src/pages/`.
Hono owns authentication, database reads, validation, authorization, and mutations.
Typed view DTOs cross the HTTP boundary; no API implementation or Prisma module
is included in browser code.

## Design and localization

Fitness uses the default Otter forest style: Geist typography, Radix green/sage
colors, 14px panels, 8px controls, light borders, and small surface shadows.
`apps/web/src/styles.css` imports focused theme, shell, dashboard, report,
training, and authentication styles from `apps/web/src/styles/`. The light
appearance stays fixed; this change does not add palette settings.

- Keep shared colors mapped to Radix semantic tokens in `styles/theme.css`.
  - Use dark accent text when green text on a tinted background would fail contrast.
  - Keep error, warning, and success colors distinct from navigation states.
- Use a 72px header and a 248px fixed sidebar above 1100px. Use a 208px sidebar from 901px to 1100px. Between 721px and 900px, show six navigation links below the header.
- At 720px and below, use a 64px header and a fixed bottom bar with four labeled destinations and More.
  - Measure the bar with `ResizeObserver`. Reserve its actual height, safe-area inset, and content spacing so it does not cover controls.
  - The More dialog provides measurements, workout data, account, authorized administrator access, and sign-out.
  - Keep locale selection in the header and return keyboard focus when the dialog closes.
- Keep active/nested navigation marked with `aria-current`, high-contrast primary controls, keyboard-visible focus, and the skip-to-content link.
- Keep ordinary controls at least 44px high. Authentication controls are at least 48px high.
- Use the split authentication layout on desktop. On narrow screens, place the form before the supporting description. Keep setup, errors, native validation, and passkey actions available.

Do not add a visual redesign as part of unrelated backend changes.

Typed English and Traditional Chinese dictionaries live in `apps/web/src/lib/`.
Bootstrap resolves the HttpOnly locale cookie and browser preference on the API.
The app does not render authenticated pages before bootstrap. Query/error states
use localized feedback, and `PageErrorMessagesProvider` supplies error/retry text.
Locale changes update document language and number/date labels, not stored keys.

## Page hierarchy

- Keep search and useful history/library rows before secondary overview and filter details. Show active criteria and a local clear action even when optional controls are collapsed.
- Put exercise identity and personal history before editors. Keep two compact working-set records visible and all-time totals in a disclosure. History entries retain workout links and separate read-only set breakdowns.
- Put recorded workout results and sets before reuse/configuration tools. Use one responsive set representation; show saved actuals, type, optional RIR, and notes before opening correction fields. Skipped rows never show placeholder actuals or a correction editor.
- In active training, group current weight/reps with primary Complete set; keep Save and optional RIR/notes secondary. Resume is primary when paused.
- Put compact training entry before history. Show the most recently updated ongoing session first and make the others available in a disclosure. These summaries must not depend on history filters or pagination.
- Keep Start training beside its selected template, separate from past-workout logging and weekly scheduling. Keep visited template forms mounted but hidden when inactive so drafts and request keys survive source changes.
- Keep session progress, rest status, and session controls immediately before the current-set group. Do not put them after the remaining-set list or over input controls.
- Use distinct measurement/target actions. Keep measurement tables locally scrollable and target labels outside the chart plot.
- Show kg load and localized kg × reps volume units at point of use. Preserve metric definitions and calculation rules. Format recorded actuals and load records without aggregate rounding; aggregate displays retain their existing formatting.
- In Calendar, show performed-set summaries only for completed workouts. Ongoing cards provide state context and Continue training, not unavailable metrics presented as zero.
- Preserve Stats range, record scope, and consistency year independently across query submissions and browser navigation.
- Use named confirmation for passkey removal. Preserve operation-specific security feedback and account recovery advice.

## Data rules

- Weights use kilograms; see [Training features](training-features.md) for the supported data contract.
- Performed volume uses completed sets in completed workouts. Total volume includes warm-ups; working volume and personal records exclude them.
- All-time records retain recorded dates, including future-dated retrospective records. Selected ranges use calendar days through today; all-time records are labeled separately.
- Daily volume combines same-day sessions. Weekly buckets start Sunday, include empty weeks, and remain bounded to 52 displayed periods without dropping records.
- Exercise distribution counts each selected set once, with six named groups and Other. Leader tables retain the top-eight limit.
- Personal records retain maximum load, repetitions, set volume, and estimated 1RM with their source calendar dates. HTTP calendar dates are `YYYY-MM-DD`, not UTC timestamps.
- New retrospective workouts use `/workouts/new`; calendar links preserve the selected date. **Start training** remains the separate live-session workflow.

## Forms and failures

Native validation, submitter values, external form association, pending controls,
and explicit delete/abandon confirmation remain supported. Query invalidation
replaces framework revalidation. Failed mutations retain drafts and do not retry
automatically. Stable creation keys recover committed writes after a lost response.

Expected API errors use stable codes and localized inline feedback. Permanent
missing/forbidden outcomes have a localized heading and local recovery link;
transient read failures retain explicit retry. A 401 still clears private state.
Native alias and set disclosures keep their forms mounted so closing does not
discard drafts, pending guards, or feedback. Failed saves and native validation
open containing disclosures so users can reach
the feedback and correction controls without losing drafts. Duplicate
alias feedback retains the open disclosure and entered text. A deliberately
invalid hidden resource ID causes no write; reloading restores confirmed state.
Query failures expose **Try again**. Conflict recovery refreshes confirmed data
without silently resubmitting a mutation or clearing dirty session values.

## Verification

Both development and production HTTPS browser suites are required in Node 24 CI.
They run without retries or skips. Tests
cover auth/admin/user isolation, forms and reset behavior, filters/pagination,
calendar navigation, virtual passkeys, data import/export, draft preservation,
retry/conflict recovery, keyboard access, axe, and responsive layouts.

Browser tests use disposable data on port 8784, refuse existing servers, and stop
their own stack. Run shared-package builds and the pre-commit gate before browser
workflows. The development API restarts when shared package output changes.
`tests/browser.ts` selects system Chrome when available and
bundled full Chromium on Linux without Chrome. Persistent zoom tests use the
same selection. The headed participant configuration adds the Wayland argument
under WSLg without changing headless launches. `otter-ui.spec.ts` checks both
locales at 1440px, 768px, 390px, and 320px, including loaded fonts, theme tokens,
axe, navigation, reflow, and measured bottom-bar clearance. Screenshots and traces
are ignored local artifacts under `test-results/`; do not commit them. Development uses SQLite; production-mode
checks require isolated PostgreSQL and HTTPS. See [current migration evidence](hono-migration-verification.md)
for command results and the separately authorized production rollout requirements. Historical dashboard/training evidence
must not be treated as verification of the new runtime.
