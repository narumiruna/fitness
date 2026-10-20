# Hono Monorepo Migration: 03 Vite Browser App

## Goal

Replace Next.js pages and Server Action bindings with a Vite React app that uses
the Hono API, without a visual redesign or loss of existing workflows.

## Context

Prerequisite: phase 02 endpoint contracts and security tests pass. The
JavaScript-required SPA decision in 00 must be accepted before implementation.
Preserve Radix Themes/Primitives/Icons, current CSS, English/zh-TW dictionaries,
and user-entered data. API authorization remains authoritative.

## Architecture

Create private `@narumitw/fitness-web` in `apps/web` using React Router and Vite.
Use TanStack Query for API-backed state and invalidation, as in Otter. Keep form
drafts separate from server state; do not add React Hook Form unless a specific
form needs it. Use relative `/api` URLs and same-origin cookies, without browser
database credentials or a new cross-origin deployment.

## Plan

- [x] Add Vite entry, router, theme/layout, browser-safe aliases, and the bootstrap
  request. Render explicit loading and failure states before auth/locale is known;
  do not briefly display protected data or English before locale resolution.
- [x] Map all existing browser paths: root, setup/login, workouts/list/new/detail,
  calendar, stats, exercises/list/detail, measurements, data, admin/users,
  account/password, account/passkeys, and source. Preserve query filters,
  pagination, root/setup/login routing, missing-record views, history navigation,
  and direct links. Test refresh on nested URLs.
- [x] Add a typed API client with runtime response guards, stable error codes,
  authentication-expiry handling, and request cancellation. Clear private query
  caches and drafts on logout/account change. Do not retry mutations by default.
  Test 401/403/404/409/network failures and stale in-flight responses.
- [x] Replace action-bound forms, Next links/navigation, `useFormStatus`,
  `revalidatePath`, and `router.refresh`. Preserve native validation, submitter
  values, external form association, reset behavior, pending state, focus,
  localized status feedback, and drafts after failures.
- [x] Port login/setup/admin/password/passkey pages. Use the existing WebAuthn
  browser integration against explicit API operations. Verify both successful
  authentication and rejected password/origin/challenge cases without exposing
  credential material.
- [x] Port recorded workouts, set editors, templates, and active sessions.
  Preserve repeat-safe draft keys across lost responses, optimistic-version
  conflict feedback, explicit refresh without automatic resubmit, desktop/mobile
  value consistency, partial finish confirmation, and rest/session timers.
- [x] Port schedules/progression, exercise search/rename/aliases/metadata/history,
  measurements/goals, CSV preview/mapping/confirmation/download, and reports.
  Keep permission-specific UI and server-authoritative validation. Verify
  cancellation, duplicate feedback, and failed-save draft recovery.
- [x] Move locale dictionaries and browser formatting into the web workspace.
  Change language through the cookie-setting API, invalidate locale-dependent
  data, update document language, and preserve locale before/after login.
  Test placeholder/type parity, unsupported language fallback, and localized
  dates/numbers without changing workout date keys.
- [x] Replace Next metadata/assets with Vite HTML/public assets. Preserve title,
  description, icon assets, skip link, accessible navigation, and `/source`
  attribution/license information.
- [x] Configure root development orchestration: Vite on loopback 8784 proxies API
  requests to an available loopback API port, proposed 8785. Fail on occupied
  ports without stopping other services. Watch shared packages, preserve request
  Origin/cookies through the proxy, and terminate only owned child processes.
- [x] Move browser specs to `apps/web/e2e/`; retain fixtures and runners outside
  that spec directory. Replace page-POST/Server Action header interception in
  passkey, exercise, and lost-response tests with API endpoint interception.
  Preserve behavioral assertions; do not replace them with weaker success checks.
- [x] Verify keyboard access, dialogs, form reset, error boundaries, loading
  states, session expiry, and 320px–1440px layouts with Playwright and axe.
  Remove obsolete `nextjs-portal` exclusions, not accessibility rules.
- [x] Add a web Changeset and run browser/client/core/contracts checks and build.
  Inspect browser output/dependency graph for Prisma, Node modules, secrets,
  and API implementation imports.

## Rollback / Recovery

Keep the pre-migration revision available; do not mix the new frontend with the
old Server Action protocol. Revert frontend/API changes together for a full
rollback. Do not discard saved user data to repair client state. Testing uses
disposable data and stops its own servers.

## Execution Evidence

The complete development browser run passed all 50 tests in 3.9 minutes. The
suite checks virtual WebAuthn, lost-response retries, stale writes, user isolation,
locale, native forms, route errors, axe, and responsive views. Build and typecheck
pass. Tests now wait for SPA bootstrap redirects and assert HTTP error codes and
localized missing-record feedback instead of framework-generated Next.js errors.
Failed alias submissions retain their disclosure and draft; inline failure plus
reload recovery replaces the old framework error-page reset.

See `docs/hono-migration-verification.md` for limits and final handoff.

## Completion Checklist

- [x] All route/workflow matrix entries pass on the Vite/Hono development stack.
- [x] Lost-response retry, stale-write recovery, auth expiry, and draft tests pass.
- [x] Locale, accessibility, responsive layout, and direct-link tests pass.
- [x] Browser output contains no server implementation or credentials.
- [x] Web build and relevant workspace checks pass without Next.js imports.
- [x] The no-JavaScript behavior change has explicit acceptance evidence.
- [x] Record results in 00 before deleting this completed plan.
