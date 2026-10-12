# Dashboard reference review

## Scope

Match the visual quality of the four supplied dashboard references, using actual application data rather than copying their sample totals or adding nonfunctional controls.

| Reference | Route | Implemented visual treatment |
| --- | --- | --- |
| `ChatGPT 圖像 2026年10月11日 上午11_20_24.png` | `/exercises` | Left-aligned page header, grouped metrics, compact exercise rows with equipment and muscle metadata, muscle-group filter links, recent usage sidebar. |
| `ChatGPT 圖像 2026年10月11日 上午11_20_19.png` | `/stats` | Overview before reports, paired volume and frequency charts, three-column distribution/volume/record cards, consistent teal chart palette. |
| `ChatGPT 圖像 2026年10月11日 上午11_20_02.png` | `/calendar` | Compact month grid, event dots, selected-day highlight, right-hand workout details and primary action, readable agenda. |
| `極簡健身訓練儀表板.png` | `/workouts` | Header and metrics in the main column, month-grouped history, actual-data mini calendar in the sidebar, templates and creation controls. |

All references are hosted under `https://sharex.narumi.dev/2026/10/11/`.

Shared styling uses a pale neutral background, white surfaces, thin borders, restrained rounding, dark headings, muted metadata, teal icons, and teal primary actions. Scheduling and advanced statistics remain available through native keyboard-accessible disclosures rather than preceding the dashboard.

Existing pagination, data models, language controls, account links, measurements, and data-transfer navigation remain intact. Favorites, illustrative comparison percentages, and fictional durations from the reference images are not fabricated. The existing six statistics metrics are retained.

## Playwright evidence

`e2e/visual-dashboard.spec.ts` creates an isolated user, eight exercises with muscle/equipment metadata, 24 workouts, and four templates. It captures all four routes at 1440, 768, and 390 pixels, both full-page and viewport images. Each capture checks horizontal overflow and WCAG A/AA accessibility with axe. The runner uses disposable SQLite and stops its development server afterward.

Run:

```sh
npm run test:ui -- e2e/visual-dashboard.spec.ts
```

Review artifacts for this implementation:

- `.cache/ui-reference/`: four downloaded references.
- `.cache/ui-before/`: pre-change full-page captures.
- `.cache/ui-review/final/`: 24 final images from the isolated visual test.
- `.cache/ui-review/workflows/`: captures from the complete UI suite, including additional shared-library data.

Each final filename is `<route>-<width>.png` or `<route>-<width>-viewport.png`. Local artifacts are intentionally not committed. Desktop, tablet, and phone images were visually inspected for hierarchy, spacing, clipping, chart legibility, and column reflow. Desktop sidebars reflow below primary content on narrow screens; the phone calendar uses accessible event markers instead of cramped titles.

## Verification

- `npm run check`: passed with no lint warnings or TypeScript errors.
- `npm run build`: passed.
- `npm run test:dashboard`: 8 passed.
- `npm run test:ui`: 19 passed, including empty states, populated views, filtering, owner isolation, training, translations, and responsive accessibility.
- Isolated final visual test: passed; 24 screenshots captured.
- `git diff --check`: passed.
- Port 8784 has no listening development server after testing.

No production services or databases were changed.

## Review follow-up

All three review findings on PR #14 were independently reproduced and classified as in-scope P2 regressions:

| Item | Evidence before the fix | Implemented outcome |
| --- | --- | --- |
| `4243051148`: explicit button accents | The actual passkey delete button rendered teal instead of Radix's red high-contrast color. | Default/empty-accent solid buttons remain teal; explicit accent colors retain Radix styling. |
| `4243051152`: monthly count translation | The sidebar rendered `0 This month`. | Whole-message count templates handle zero, one, and multiple workouts in English and Traditional Chinese, with locale-formatted numbers. |
| `4243051156`: visible exercise errors | A duplicate-exercise alert ended at y=3773, below a library heading at y=358. | Error states reserve the row immediately after the header; metrics and library move down without overlapping the sidebar. |
| Additional finding: long aliases | The narrower exercise alias column allowed a long badge to overlap action buttons. | Alias badges wrap within their column; a bounds assertion protects the actions. |

`e2e/dashboard-review.spec.ts` covers computed button colors, six count/language combinations, actual duplicate exercise and alias submissions, error placement at 1440/1024/768/390 pixels, and alias/action separation. Review screenshots are saved in the corresponding `test-results/dashboard-review-*` directories. The submitted review wrapper and automated summary contain no additional requests. No items require deferral, clarification, or external action.

First follow-up validation: `npm run check`, `npm run build`, `npm run test:i18n` (4 tests), `prek run -a`, and `npm run test:ui` (22 tests) passed. The browser runner uses disposable SQLite and leaves port 8784 free.

### Second review follow-up

| Item | Evidence before the fix | Implemented outcome |
| --- | --- | --- |
| `4243108055`: muscle-group/filter mismatch | A group advertised one primary exercise but its link returned two exercises, including a secondary assignment. | The sidebar is labeled “Muscle groups” and counts both primary and secondary assignments, matching the existing any-role filter. The composite key `(exerciseId, muscle)` ensures these counts represent distinct exercises per muscle. |
| `4243108060`: muscle-group count grammar | A one-exercise group rendered `1 Exercises`. | Complete singular/plural templates render `1 exercise`, `3 exercises`, or localized Traditional Chinese labels with formatted numbers. |
| `4243108064`: adjacent-month indicators | A visible completed workout on September 27 had no `has-workout` marker in October\u2019s mini-calendar. | Query all 42 displayed cells, but calculate the footer count only from dates within the current month. Owner and completed-state restrictions remain unchanged. |

All three are independently reproduced, in-scope P2 defects introduced by the new sidebar/calendar. Existing resolved findings remain addressed. No deferrals, clarification requests, or blockers were identified. The new regression cases verify count/result consistency for mixed muscle roles, singular/plural labels in English and Traditional Chinese, adjacent-month markers, current-month totals, owner isolation, abandoned-session exclusion, the exclusive end-date boundary, and navigation to a displayed adjacent day. Screenshots cover both translated labels and adjacent-month indicators.

Second follow-up validation: `npm run check`, `npm run build`, `npm run test:i18n` (4 tests), `prek run -a`, and `npm run test:ui` (25 tests) passed.
