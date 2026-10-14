# Keyboard and calendar UI review

## Scope

Review the workout, calendar, statistics, and exercise dashboards at 1440, 768, and 390 pixels. Check screenshots, horizontal overflow, and WCAG A/AA rules with Playwright and axe. Use disposable SQLite data on port 8784. Do not access production services.

## Resolved findings

1. **Repeated header has no keyboard bypass.** Add a localized skip link as the first page control. Show it on focus and move focus to the main content when activated. Verify on desktop and mobile in English and Traditional Chinese.
2. **Mini-calendar workout dots provide visual information only.** Add a localized accessible description to dates with completed workouts. Keep dates without workouts undescribed. Retain the existing date names and today marker.
3. **Adjacent-month dates open the current month.** Build each mini-calendar link from its date's year and month. Add the selected-date fragment so the destination scrolls to the workout details. Verify the URL, selected workout, and visible details panel.

## Verification

- Baseline dashboard screenshot and accessibility test passed.
- All 44 development UI tests passed after the changes, using disposable SQLite data.
- Dashboard screenshots and axe checks passed at 1440, 768, and 390 pixels.
- `npm run check`, `npm run build`, and `prek run -a` passed.
- The test server stopped after the suite; port 8784 has no listener.

The development UI suite does not verify production PostgreSQL behavior. These changes do not change database queries, schemas, or server actions.
