# Hono Monorepo Migration: 01 Workspaces and Changesets

## Goal

Create the workspace and version-management foundation without changing product
behavior or publishing packages.

## Context

Prerequisite: discovery and baseline decisions in
[00 Overview](2026-10-20_00_hono-monorepo-overview-plan.md).
Next.js remains the baseline at this checkpoint. Final app replacement occurs
in phases 02 and 03; phase 01 does not require empty app packages.

Fitness has one private `fitness@1.0.0` package. Otter uses npm workspaces,
Changesets private-package versioning, and an npm release workflow for its CLI.
Fitness has no public package; that publication workflow must not be copied.

## Plan

- [x] Record baseline `npm run check`, `npm run build`, pure tests, and an
  isolated UI smoke test. Record failures before moving code; do not hide them
  with skipped assertions. Confirm Node/package engine compatibility.
- [x] Add root workspaces `apps/*` and `packages/*` and retain
  `package-lock.json`. Keep root tooling private and outside package releases.
  Verify a clean `npm ci` resolves local workspace dependencies.
- [x] Extract browser-safe rules and their direct dependencies from
  `src/lib/training.ts`, `calendar.ts`, and `stats-calculations.ts` into
  `@narumitw/fitness-core`; move related pure tests and update current consumers.
  Keep Node crypto, Prisma, cookies, translated UI text, and server services out.
  Verify unchanged calculation and date-boundary results.
- [x] Give core explicit exports and TypeScript declaration/build output. Add
  root build ordering and development watching for shared output; verify an
  edit updates a consumer without a manual rebuild. Keep strict TypeScript and
  shared Biome rules; do not impose Node module resolution on browser projects.
- [x] Add Changesets CLI, configuration, and root `changeset` and
  `version-packages` scripts. Start new workspace packages at `1.0.0` with
  independent versions, no fixed/linked groups, and `private: true`.
  Use `privatePackages.version: true` and `privatePackages.tag: false`;
  enable internal dependency patch updates and use the verified base branch.
  Apply the same policy when API, web, and contracts are added.
- [x] Add a changeset for this extraction. Document user-visible changesets and
  empty changesets for tooling/docs-only work. Do not require a version bump
  for every private implementation edit; do require a changeset file per PR.
- [x] Add a PR check for Changesets presence/status against the PR base, with
  sufficient Git history. Test both a package changeset and an empty changeset,
  plus failure when neither exists.
- [x] Document the version-only release process in `docs/releasing.md`.
  Do not add npm publish, an npm token, or automatic deployment/tagging.
  Test `version-packages` in a disposable checkout: package versions,
  changelogs, internal ranges, and lockfile must agree; the original checkout
  must remain unchanged.
- [x] Update root check/typecheck/build commands and Git hooks for workspaces
  without repeated lifecycle builds. Keep the existing focused test commands.
  Verify the baseline Next.js app still builds and its smoke test passes.

## Release Boundary

Create a release PR manually at first. Changesets support does not require an
automatic release workflow. A release PR merge into `main` would currently deploy
production; phase 04 must document or resolve this gate before any such merge.

## Rollback / Recovery

Revert only this phase's workspace/core/configuration changes on the migration
branch. Keep database schema and migration contents unchanged. Version-command
experiments run only in disposable checkouts and must not create remote tags.

## Execution Evidence

Disposable legacy checkout with the extracted core passed check/build, all 32
legacy pure tests, and 3 measurements browser tests on an isolated port. Core has
18 passing tests in two timezones; Changesets has 8 passing Git fixtures. Both
package and empty version rehearsals passed without publication or tags. A fresh
copy of the final workspace also passed npm ci, check, build, and 21 API tests.

See `docs/hono-migration-verification.md` for limits and final handoff.

## Completion Checklist

- [x] Clean installation, core unit tests, root checks, and baseline build pass.
- [x] Isolated baseline UI smoke test passes; its own server is stopped afterward.
- [x] Workspace dependency direction and browser-safe core exports are verified.
- [x] Changesets PR checks and version-only dry run pass with recorded evidence.
- [x] No package was published, remote tag created, or production service changed.
- [x] Record results in 00 before deleting this completed plan.
