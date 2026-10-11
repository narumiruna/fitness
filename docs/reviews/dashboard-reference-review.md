# Dashboard reference review

## Scope

Match the visual quality of the four supplied dashboard references, using actual application data rather than copying their sample totals or adding nonfunctional controls.

| Reference | Route | Implemented visual treatment |
| --- | --- | --- |
| `ChatGPT 圖像 2026年10月11日 上午11_20_24.png` | `/exercises` | Left-aligned page header, grouped metrics, compact exercise rows with equipment and muscle metadata, primary-muscle filter links, recent usage sidebar. |
| `ChatGPT 圖像 2026年10月11日 上午11_20_19.png` | `/stats` | Overview before reports, paired volume and frequency charts, three-column distribution/volume/record cards, consistent teal chart palette. |
| `ChatGPT 圖像 2026年10月11日 上午11_20_02.png` | `/calendar` | Compact month grid, event dots, selected-day highlight, right-hand workout details and primary action, readable agenda. |
| `極簡健身訓練儀表板.png` | `/workouts` | Header and metrics in the main column, month-grouped history, actual-data mini calendar in the sidebar, templates and creation controls. |

All references are hosted under `https://sharex.narumi.dev/2026/10/11/`.

Shared styling uses a pale neutral background, white surfaces, thin borders, restrained rounding, dark headings, muted metadata, teal icons, and teal primary actions. Scheduling and advanced statistics remain available through native keyboard-accessible disclosures rather than preceding the dashboard.

Existing pagination, data models, language controls, account links, measurements, and data-transfer navigation remain intact. Favorites, illustrative comparison percentages, and fictional durations from the reference images are not fabricated. The existing six statistics metrics are retained.

## Playwright evidence

`tests/visual-dashboard.spec.ts` creates an isolated user, eight exercises with muscle/equipment metadata, 24 workouts, and four templates. It captures all four routes at 1440, 768, and 390 pixels, both full-page and viewport images. Each capture checks horizontal overflow and WCAG A/AA accessibility with axe. The runner uses disposable SQLite and stops its development server afterward.

Run:

```sh
npm run test:ui -- tests/visual-dashboard.spec.ts
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
