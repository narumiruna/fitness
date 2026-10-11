# Set Types and RIR Plan

## Goal

Distinguish warm-up and working sets and optionally record reps in reserve (RIR).

## Context

- `WorkoutSet` and `WorkoutTemplateSet` store weight, reps, order, and notes only.
- `src/lib/validation.ts` validates set input; `src/lib/stats.ts` and exercise history compute statistics separately.
- References: `/Users/narumi/src/openGym/docs/dev/SET_TYPES.md` and `/Users/narumi/src/wger/wger/manager/models/log.py`.

## Architecture

- Add WARMUP and WORKING set types to workouts and templates; default existing rows to WORKING.
- Add nullable actual RIR to workout sets only. Accept half-step values from 0 to 10; blank is unknown, not zero.
- Do not copy actual RIR when repeating a workout or saving a template.
- Keep total recorded volume available and label it clearly; show working-set volume separately.
- Use working sets for PRs and progression. When active mode exists, apply its completion filter before all calculations.
- Centralize set eligibility and volume calculations so stats and exercise history agree.

## Non-Goals

RPE, supersets, drop sets, rest-pause sets, timed exercises, and effort-based coaching.

## Implementation Rules

- Keep Next.js App Router, TypeScript, Prisma, SQLite, Zod, and Biome.
- Use Radix UI for new interactions where applicable; verify installed packages before adding only the packages needed.
- Put authentication and database writes on the server; derive user identity from `requireUser()`.
- Add English UI strings through `src/lib/i18n.ts`.
- Reference repositories are read-only; inspect relevant code and license terms before adapting anything.
- No test script currently exists. Use Node's test runner with the installed `tsx` loader for pure TypeScript tests; add a focused test command and document it. Keep database tests on a disposable SQLite database.
- Follow root `AGENTS.md`; do not edit generated Prisma files or commit local databases.

## Plan

- [ ] Inventory set entry, copy, template, history, stats, and CSV paths; document which need type or RIR support and preserve legacy CSV behavior.
- [ ] Add fields and a named migration; empty-database and legacy-copy fixtures prove WORKING defaults and null RIR without changes to weight or reps.
- [ ] Extend Zod schemas and server actions; tests accept blank, zero, and half-step RIR and reject nonfinite, out-of-range, and invalid-step values.
- [ ] Add accessible type and optional RIR controls with dictionary help text; browser checks show create, edit, and clear behavior.
- [ ] Update repeat and template paths; tests prove type is retained, actual RIR is cleared on repetition, and templates contain no actual RIR.
- [ ] Consolidate calculation helpers and update stats and exercise history; fixtures distinguish total and working volume and exclude warm-ups from PRs.
- [ ] Test owner isolation and legacy forms that omit the new fields; defaults preserve existing entry workflows.
- [ ] Test backup restoration and record migration evidence.

## Rollback / Recovery

- Before applying the migration to an existing database, stop writes and make a SQLite backup with a verified restore on a disposable database.
- Test the migration on an empty database and a copy of existing data; compare record counts and preserved field values.
- Do not use `db:push`, database resets, or destructive down migrations as recovery.
- These columns are additive. If reverting application code, retain the columns and data; do not drop RIR or set-type values. Old reports may include warm-up sets, so prefer a forward correction.
- Before release, document the tested recovery procedure. A full backup restore discards later writes and needs explicit approval.

## Completion Checklist

- [ ] Feature tests pass with the exact command and results recorded in this plan.
- [ ] `npm run check` and `npm run build` pass.
- [ ] Browser smoke tests pass at `http://localhost:8783`, including the feature workflow, empty state, and keyboard interaction; stop the dev server afterward.
- [ ] Existing rows remain WORKING with null RIR; total volume is preserved and working-only metrics are labeled.
- [ ] Review the diff for user isolation, English dictionary strings, generated artifacts, and unrelated changes.
- [ ] If committing, run `prek run -a` and stage only intended paths; otherwise record that no commit was requested.
- [ ] Record verification results and any accepted limits in the handoff; delete this plan only after every task and completion check passes.
