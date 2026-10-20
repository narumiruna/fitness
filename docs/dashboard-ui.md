# Dashboard UI

## Structure

- Workouts: month-grouped history, session-state badges, prescribed/completed progress, continue links, filters, user-scoped totals, exercise previews, focused creation at `/workouts/new`, and templates. Keep 20-row pagination and title/notes search semantics. Filters and pagination affect history, not all-time summary totals.
- Calendar: Sunday-first, 42-cell month grid, local-date selection, selected-day workouts, selected-date creation, and month agenda. Narrow screens show the selected date before the agenda. Markers retain accessible names and detail links.
- Stats: URL-based ranges, daily volume, Sunday-start weekly counts, exercise distribution, exercise volume, and personal records. Detailed totals and comparisons remain available without replacing the compact overview.
- Exercises: shared library, localized-name/normalized-alias search, name and personal-use sorting, aliases, creation, metadata filters, and personal recent-use dates. Usage counts and dates exclude other users' workouts.

Components live in `apps/web/src/components/`; pages live in `apps/web/src/pages/`.
Hono owns authentication, database reads, validation, authorization, and mutations.
Typed view DTOs cross the HTTP boundary; no API implementation or Prisma module
is included in browser code.

## Design and localization

`apps/web/src/styles.css` retains the existing dashboard CSS and Radix theme
integration. Keep active/nested navigation marked with `aria-current`, high
contrast primary controls, keyboard-visible focus, and the skip-to-content link.
Do not add a visual redesign as part of backend changes.

Typed English and Traditional Chinese dictionaries live in `apps/web/src/lib/`.
Bootstrap resolves the HttpOnly locale cookie and browser preference on the API.
The app does not render authenticated pages before bootstrap. Query/error states
use localized feedback, and `PageErrorMessagesProvider` supplies error/retry text.
Locale changes update document language and number/date labels, not stored keys.

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

Expected API errors use stable codes and localized inline feedback. A missing
record has a localized route error rather than a Next.js-generated page. Duplicate
alias feedback retains the open disclosure and entered text. A deliberately
invalid hidden resource ID causes no write; reloading restores confirmed state.
Query failures expose **Try again**. Conflict recovery refreshes confirmed data
without silently resubmitting a mutation or clearing dirty session values.

## Verification

The Hono/Vite migration passed all 51 development browser tests and all 51
production HTTPS browser tests in Node 24 CI, without retries or skips. Tests
cover auth/admin/user isolation, forms and reset behavior, filters/pagination,
calendar navigation, virtual passkeys, data import/export, draft preservation,
retry/conflict recovery, keyboard access, axe, and responsive layouts.

Browser tests use disposable data on port 8784, refuse existing servers, and stop
their own stack. Screenshots and traces are ignored local artifacts under
`test-results/`; do not commit them. Development uses SQLite; production-mode
checks require isolated PostgreSQL and HTTPS. See [current migration evidence](hono-migration-verification.md)
for command results and the separately authorized production rollout requirements. Historical dashboard/training evidence
must not be treated as verification of the new runtime.
