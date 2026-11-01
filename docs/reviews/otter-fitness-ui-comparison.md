# Otter and Fitness UI Comparison — 2026-11-01

## Result

The light-mode design foundation is close. The implementation is **not a complete visual or interaction match** for Otter.

- All **10 measured light palette/radius tokens match** across 41 light-mode sample pairs.
- The sampled desktop page titles match **6 of 6 declared CSS properties**.
- Primary button colors, rendered fonts, mobile breakpoints, authentication order, card variants, and navigation structure differ.
- Otter follows the system dark appearance. Fitness stays light in the tested implementation.

These counts describe explicit properties. They are not an overall similarity percentage. Different product content makes a whole-page pixel-difference score unsuitable.

## Method

| Item | Configuration |
| --- | --- |
| Fitness | Commit `72be0cd`; real frontend and HTTP API with disposable SQLite |
| Otter | Commit `d2cfe84`; real frontend with synthetic API interception based on its interface-test fixtures |
| Browser | Playwright 1.64.0, headless full Chromium 156.0.8078.4 |
| Runtime | Node 26.11.1 on Linux/WSLg; timezone `Asia/Taipei` |
| Core viewports | 1440 × 900, 768 × 900, 390 × 900, 320 × 900 |
| Locales | English and Traditional Chinese |
| Core pairs | Authentication, primary dashboard, analysis, and account/settings; 32 pairs |
| Boundary probes | English dashboard at 680, 681, 700, 720, 721, 900, 901, 1100, and 1101px; 9 pairs |
| Dark probes | Authentication at 390px in both locales; 2 pairs |
| Total | 43 pairs: 86 viewport images and 16 additional full-page images |

The same browser, viewport, locale, and color scheme were used for each pair. Animations were disabled for screenshots. Measurements waited for loaded fonts and two animation frames after viewport changes. Separate, non-animated color probes resolved semantic colors to sRGB values. Chromium CDP identified the fonts that rendered sampled text; a loaded font or declared family alone was not treated as font parity.

Only the final capture run is used below. Preparatory captures with blocked external fonts or an unstable color probe are excluded. The final reference page allowed its public Google Fonts CSS/font origins, with HTTP 200 responses. All reference API requests were synthetic; no unexpected API request or browser script error was recorded. No Otter API, database, or Compose service was started.

Fitness used three synthetic exercises, five completed workouts, and one template. Otter used three synthetic participants and five expenses. Amounts, titles, labels, branding, and product functions were not scored as style defects.

## Matching foundation

All values below matched in every light sample pair.

| Semantic token | Otter | Fitness |
| --- | --- | --- |
| Background | `#f7f9f8` | `#f7f9f8` |
| Surface | `#ffffff` | `#ffffff` |
| Text | `#1a211e` | `#1a211e` |
| Muted surface | `#eef1f0` | `#eef1f0` |
| Muted text | `#5f6563` | `#5f6563` |
| Border | `#d7dad9` | `#d7dad9` |
| Soft accent | `#e6f6eb` | `#e6f6eb` |
| Accent text | `#193b2d` | `#193b2d` |
| Strong accent | `#218358` | `#218358` |
| Panel radius | `14px` | `14px` |

At 1440px, both desktop headers are 72px high with 32px horizontal padding. Both workspace sidebars are 248px wide. Both workspace content areas start at x=248px and use 32px top padding and 43.2px horizontal padding. Their desktop title declarations match: family stack, 34.56px size, weight 650, 43.2px line height, −1.3824px tracking, and text color.

At 1100px, both desktop sidebar widths are 208px. At 680px, both bottom navigation bars occupy y=823–900px in the 900px-high viewport. This confirms shared geometry at these sizes, not equivalent navigation responsibilities or text rendering.

## Measured differences

### 1. Button variants do not use the same colors

The English desktop sign-in buttons have the same 48px height, 8px radius, 14px text size, and weight 600. Their color assignments differ:

| Property | Otter | Fitness |
| --- | --- | --- |
| Solid background | `#218358` | `#193b2d` |
| Text | `#ffffff` | `#fbfdfc` |
| Radix contrast variant | Ordinary solid | High-contrast solid |

The same bright-green versus dark-green difference appears in the main workspace action. In the auth screenshots, Otter's passkey action is outlined; Fitness uses a soft green fill. Matching palette variables therefore do not establish matching component variants.

Evidence: `pairs/auth-en-1440.png`, `pairs/auth-en-390.png`, and `pairs/dashboard-en-1440.png`.

### 2. Font loading and inheritance differ

| Sampled rendered text | Otter | Fitness |
| --- | --- | --- |
| English auth title, label, and solid button | System `DejaVu Sans` | Custom `Geist` |
| English promotional heading | Custom `Geist` | Custom `Geist` |
| Traditional Chinese promotional heading | Downloaded Noto Sans TC | System `WenQuanYi Zen Hei` |
| Traditional Chinese auth title and label | System `WenQuanYi Zen Hei` | System `WenQuanYi Zen Hei` |

Otter loads Noto Sans TC from Google Fonts. Fitness loads Geist but does not load that Chinese font. CDP reports the downloaded Noto family as `Noto Sans TC Thin`; the captured CSS weight must still be read separately from the family name.

Otter's Radix auth card and controls use its system `--default-font-family`, although the surrounding app declares Geist. Fitness maps that Radix font variable to Geist. This is an inconsistency in the rendered reference, not a reason to replace Fitness's consistent font mapping without a design decision.

The auth titles are both 29.6px, but their CSS weights are 700 in Otter and 650 in Fitness. Auth input wrappers are both 48px high; their corner radii are 9px and 8px. The inner auth text is 16px in both, with 24px versus 20px line height. The sampled ordinary account fields use 16px text in Otter and 14px in Fitness; those fields have different functions, so only their control styles are compared.

Evidence: CDP `renderedFonts` in `measurements.json`; `pairs/auth-en-1440.png` and `pairs/auth-zh-TW-1440.png`.

### 3. Mobile authentication order and margins differ

At 390px in English:

| Property | Otter | Fitness |
| --- | --- | --- |
| Outer horizontal margin | 24px | 16px |
| Layout width | 342px | 358px |
| First panel | Promotion, y=64px | Sign-in form, y=88px |
| Other panel | Form starts at y=403.89px | Promotion starts at y=629.06px |
| Language selection | Inside auth card | In header |

Traditional Chinese has the same ordering difference. Text length changes panel heights, so the English y positions are not generalized to every locale. Below-viewport content was checked with the full-page captures; it is not classified as missing.

Evidence: `pairs/auth-en-390.png`, the Traditional Chinese captures, and the corresponding `*-full.png` images.

### 4. Responsive navigation changes at different widths

| Width | Otter | Fitness |
| --- | --- | --- |
| 680px | 64px header and bottom navigation | 64px header and bottom navigation |
| 681–720px | 72px header and content-level workspace tabs | 64px header and fixed bottom navigation |
| 721px and 900px samples | 72px header; tabs below group details | 129px two-row header containing navigation |
| 901px | 208px group sidebar plus workspace tabs | 208px route sidebar |
| 1101px | 248px group sidebar plus workspace tabs | 248px route sidebar |

The mobile breakpoints are 680px and 720px. Otter's sidebar selects groups; Fitness's sidebar selects application pages. Otter retains a second workspace tab row on desktop. Fitness does not use that same two-level structure. Otter also has a floating add action above its mobile bar; Fitness keeps its creation link in the page header.

Evidence: `pairs/breakpoint-en-700.png` and the nine boundary measurements.

### 5. Overview card treatment and spacing differ

At 1440px, the sampled Otter overview settlement panel and Fitness history panel both use white surfaces and 14px corners. Otter uses a transparent border, no shadow, and 25.6px padding. Fitness uses the visible `#d7dad9` border, a small shadow, and 24px padding.

This is a variant difference, not a rule for every Otter card. The sampled analysis surfaces in both applications have visible borders and the same small shadow; their padding still differs by 1.6px. Account/profile surfaces have further spacing differences.

Card widths and heights are not scored as equivalent components: a settlement panel, workout history list, and analysis container have different content and responsibilities.

Evidence: `pairs/dashboard-en-1440.png`, `pairs/analysis-en-1440.png`, and the card style measurements.

### 6. Header and settings composition differ

Otter groups account actions behind one avatar/name trigger. Fitness shows language selection, an account link, and sign-out separately on desktop. The closed-header captures establish this grouping difference; this audit did not test open account-menu behavior.

Otter's captured account page contains preferences, appearance controls, and section navigation. Fitness's paired route is a focused password-change form. They are not equivalent-function pages. Their different widths and content density are visible structural differences, not evidence that all Otter settings features must be copied into Fitness.

Evidence: `pairs/settings-en-1440.png` and the header captures.

### 7. System dark appearance is not matched

Under a dark system preference, Otter changes its background to `#171918` and text to `#eceeed`. Fitness remains at `#f7f9f8` and `#1a211e`. Both locales show this difference.

Fitness currently fixes the Radix appearance to light. This was an explicit limit of the redesign, not a failing contrast check. Matching Otter's theme behavior would require additional implementation work.

Evidence: `pairs/dark-auth-en-390.png` and the two dark-probe token sets.

## Checks and limits

- Final comparison: one Playwright case passed without retries, collecting all 43 pairs.
- The temporary workflow passed strict TypeScript after keeping fixture category tuples narrow; runtime fixture values did not change. `npm run check` passed after the temporary source files were removed.
- No document-level horizontal overflow was measured in any of the 86 viewport states.
- Eight sampled authentication states passed the selected axe WCAG 2 A/AA and 2.1 AA rules. This is not a complete accessibility or screen-reader assessment.
- Font requests from the two expected public font origins returned HTTP 200. No unexpected reference API traffic or script errors were recorded.
- Both local application servers stopped. The temporary Fitness database was removed by its runner. No application code, production service, or stored user data changed.
- This visual comparison does not prove Otter backend behavior, complete workflow parity, release readiness, or subjective acceptance.

## Recommended follow-up

If exact reference parity is required, use this order:

1. Align solid/outline/soft button variants and the intended font mappings. Include the same intended Traditional Chinese font rather than relying on the local OS fallback. Do not copy the reference's inconsistent Radix font inheritance by accident.
2. Agree on one mobile breakpoint and align navigation placement. Decide whether the group-plus-tabs structure has a valid Fitness equivalent before changing the route hierarchy.
3. Align auth margins and panel order, and match the intended overview card variants. Preserve useful Fitness workflows and do not copy expense-specific content.
4. Treat dark appearance and palette controls as a separate scope decision. They were not implemented in the current fixed-light redesign.

No corrective application changes or PR updates were made during this audit.

## Evidence and handoff

Local, ignored artifacts:

- Gallery: `test-results/otter-fitness-comparison/gallery.html`.
- Nine selected side-by-side images: `test-results/otter-fitness-comparison/pairs/`.
- Summary: `test-results/otter-fitness-comparison/analysis.json`.
- Raw selectors, styles, geometry, font faces, and source revisions: `test-results/otter-fitness-comparison/otter-comparison-measure-r-f7cfd-changing-either-application/measurements.json`.
- Reproduction files and final execution log: `test-results/otter-fitness-comparison/reproduction/`.

The capture command was `npm run test:ui -- --config tests/otter-comparison.config.ts`. The temporary spec and config are archived in the reproduction directory and removed from source after use. Reproduction requires the recorded revisions, locked dependencies, the same reference checkout path, available test ports, and access to the two public font origins. It does not require an Otter database.

The product owner can review the gallery to decide whether the remaining differences satisfy the requested style. The prerequisite is access to these local artifacts. Review light-mode component variants and mobile structure first; the expected result is a decision on the intended level of parity. Subjective visual acceptance, physical-device rendering, and real assistive technology remain unverified. The existing complete workflow CI and deployment authorization requirements still apply.
