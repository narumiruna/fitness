# Weekly Training Consistency Plan

## Goal

Show weekly training days, a yearly activity heatmap, and current and longest weekly streaks.

## Context

- `src/lib/stats.ts` provides training-day counts and period summaries but no weekly streaks.
- `src/app/calendar/page.tsx` and `src/lib/calendar.ts` use calendar dates and a Sunday-first grid.
- Reference: `/Users/narumi/src/SparkyFitness/SparkyFitnessFrontend/src/pages/Reports/TrainingConsistencyCard.tsx` and openGym's `frontend/src/views/Stats.jsx`.

## Architecture

- No schema change or saved counters. Compute results from user-owned workout history.
- A training day has at least one performed set; multiple sessions on the same date count once.
- Initially, recorded sets are performed sets. After active mode exists, require a completed workout and completed sets.
- Match the current Sunday-start calendar and date convention; document it rather than adding a time-zone preference.
- Show the last 12 weeks and the selected calendar year's daily heatmap; default to the current year.
- A successful week has at least one training day. The current streak may continue through an unfinished empty current week if the preceding week qualified; a missed closed week breaks it.
- Exclude future dates. Recompute after editing or deleting workouts.

## Non-Goals

Configurable weekly targets, reminders, awards, and a separate analytics route.

## Implementation Rules

- Keep Next.js App Router, TypeScript, Prisma, SQLite, Zod, and Biome.
- Use Radix UI for new interactions where applicable; verify installed packages before adding only the packages needed.
- Put authentication and database writes on the server; derive user identity from `requireUser()`.
- Add English UI strings through `src/lib/i18n.ts`.
- Reference repositories are read-only; inspect relevant code and license terms before adapting anything.
- No test script currently exists. Use Node's test runner with the installed `tsx` loader for pure TypeScript tests; add a focused test command and document it. Keep database tests on a disposable SQLite database.
- Follow root `AGENTS.md`; do not edit generated Prisma files or commit local databases.

## Plan

- [ ] Verify date grouping and week boundaries; record fixtures for Sunday transitions, year changes, leap days, and the current open week.
- [ ] Add pure consistency helpers and a user-scoped query; tests cover empty workouts, duplicate training dates, gaps, future dates, and longest/current streak rules.
- [ ] Add weekly cards and an accessible heatmap to `src/app/stats/page.tsx`; browser checks prove date/count labels, year selection, mobile layout, and empty state.
- [ ] Add dictionary strings that explain the weekly streak rule; keyboard users can inspect heatmap data without depending on color.
- [ ] Verify edits and deletions refresh results; test that another user's activity cannot appear.
- [ ] Record the integration contract for active mode and ensure its later completion-filter tests cover these helpers.

## Completion Checklist

- [ ] Feature tests pass with the exact command and results recorded in this plan.
- [ ] `npm run check` and `npm run build` pass.
- [ ] Browser smoke tests pass at `http://localhost:8783`, including the feature workflow, empty state, and keyboard interaction; stop the dev server afterward.
- [ ] Date-boundary fixtures and corrected-history fixtures pass without persisted streak counters.
- [ ] Review the diff for user isolation, English dictionary strings, generated artifacts, and unrelated changes.
- [ ] If committing, run `prek run -a` and stage only intended paths; otherwise record that no commit was requested.
- [ ] Record verification results and any accepted limits in the handoff; delete this plan only after every task and completion check passes.
