# PR 2 Review Ledger

Target: https://github.com/narumiruna/fitness/pull/2

Reviewed head: `5ce0738670fef05098cdab1a12a6166c92a8877b`. Repository and checkout match `narumiruna/fitness`. The working tree was clean. The complete 33-file diff, description, commit, paginated reviews/comments/conversation, and all four review threads were inspected. Thread and comment pagination report no remaining pages. No remote check runs or commit statuses were reported. The submitted review and review-summary conversation contain no additional actionable items.

## Feedback

| Item | Independent evidence and relationship to the goal | Severity | Outcome |
| --- | --- | --- | --- |
| [R1: error callback](https://github.com/narumiruna/fitness/pull/2#discussion_r4240238597) | Installed and locked Next.js is 16.4.0. Its error-boundary runtime passes both `reset` and `retry`; the installed error convention guide recommends `retry`, stable since 16.3. Browser tests trigger an exercise failure and verify recovery in development and production. The proposal conflicts with this version's documented re-fetch behavior. | No confirmed defect; proposed P1 not supported | Incorrect or conflicting — not adopted. Retain `retry`. Both final browser suites pass the recovery test. |
| [R2: weekly allocation](https://github.com/narumiruna/fitness/pull/2#discussion_r4240238600) | The original `buildWeekly` emits every intervening week, and its chart emits SVG and detail rows for each point. `createWorkoutSchema` accepts `9999-12-31`. A lone future workout has a short span, but adding it to current history spans approximately 416,000 weeks. This is a new availability risk in the redesigned Stats route. | P1: large allocation and response from small valid input | Already addressed by this fix. At most 52 adjacent Sunday-start periods retain all recorded workouts. Headings and descriptions state the aggregation; tooltips and detailed data retain full intervals. Extreme-date, conservation, bounded-range, and daylight-saving tests pass. |
| [R3: exercise usage query](https://github.com/narumiruna/fitness/pull/2#discussion_r4240238603) | The original personal-use query fetches each owned set and related names/dates, then groups rows in JavaScript. The base page used database counts. The new history-sized result is needed only for per-exercise totals and latest dates. This regression is within the redesign scope. | P2: history-dependent memory and response cost | Already addressed by this fix. Parameterized SQLite aggregation returns one row per used exercise, with count and latest date. Browser tests verify 2,000 sets, counts, dates, recent sorting, search, and user isolation. |
| [R4: setless workout chart](https://github.com/narumiruna/fitness/pull/2#discussion_r4240238605) | The original chart wrapper tests `totalSets > 0`, even though weekly values count workouts. Valid setless records contribute to overview and weekly calculations but lose their chart. Showing supported, real workout counts is part of the original goal. | P2: supported data hidden | Already addressed by this fix. Workout counts gate the count chart; sets gate volume and exercise charts. Setless guidance links to existing workouts. All-time and 30-day browser checks pass; empty-state behavior remains covered. |

## Validation

- `npm run check` and `prek run -a`: Biome and TypeScript pass.
- `git diff --check`: passes. Browser runners stopped their servers; port 8783 has no listener.
- `npm run test:dashboard`: seven tests pass in the default timezone, America/New_York, and Pacific/Auckland.
- `npm run test:db-init`: six tests pass.
- `npm run test:ui`: six development browser tests pass.
- `npm run test:ui:production`: production build and six browser tests pass.
- Desktop (1440px) and mobile (390px) captures of aggregated and setless charts were reviewed. Axis labels show period starts to prevent overlapping interval labels. Full intervals remain available in keyboard tooltips and detailed data. Both cases pass axe and horizontal-overflow checks.
- The recovery test intentionally triggers a foreign-key failure (`P2003`); its expected server log is documented in `docs/dashboard-ui.md`. Recovery succeeds without creating an alias.
- The complete fix diff was reviewed for parameter binding, user isolation, date compatibility, lifecycle safety, conserved totals, and scope. No schema, dependency, auth, environment, or developer database changes are required.

## Scope and publication

All three confirmed defects are introduced by the redesign and are in scope. No out-of-scope deferral, missing decision, or P0 incident was identified. PR 2 remained open before publication, so fixes stay on `narumi/feat/dashboard-redesign`.

This ledger accompanies the signed fix commit. Publish a reply on each linked thread with the commit and validation evidence, then resolve the four verified outcomes. Do not resolve any newly received item without inspecting its evidence. Remote check results are separate from the local results above.
