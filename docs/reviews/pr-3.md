# PR 3 Review Ledger

Target: https://github.com/narumiruna/fitness/pull/3

Reviewed head: `a11df974e44cba034838f903278e10638cb764f2`. The checkout and
remote match `narumiruna/fitness`. The complete 18-file diff, description, commit,
submitted review, inline comments, conversation, checks, and all three review
threads were inspected. All requested pages were fetched; thread and nested
comment pagination report no remaining pages. GitHub reports no check runs or
commit statuses. The generic review body and review-summary conversation contain
no additional feedback. Local generated `next-env.d.ts` changes are excluded.

## Feedback

| Item | Independent evidence and relationship to the goal | Severity | Outcome |
| --- | --- | --- | --- |
| [R1: restore SQLite](https://github.com/narumiruna/fitness/pull/3#discussion_r4240556213) | `AGENTS.md` specifies SQLite, but the user explicitly requested PostgreSQL and selected a new, empty database instead of data import. This instruction takes priority over the repository rule. The PR description and README state that SQLite files are not imported or changed; the schema, adapter, and new migration implement that goal. Reverting them would defeat the authorized change. | No confirmed defect; proposed P1 conflicts with the explicit request | Incorrect or conflicting — not adopted. Keep PostgreSQL and reply with the authorization and migration scope. The stale repository rule is acknowledged in the PR description. |
| [R2: startup cancellation](https://github.com/narumiruna/fitness/pull/3#discussion_r4240556220) | `tests/run-ui.mjs` awaits `startPostgres()` before installing signal handlers. The helper launches a detached container and polls readiness. A signal during this interval can terminate Node without removing that running container. This lifecycle defect is introduced by the PostgreSQL test runner. | P2: interrupted tests leave a detached database running | Already addressed by this review fix. Signal handlers are installed before startup. An AbortSignal stops readiness polling, startup error cleanup removes the detached container, and the runner preserves exit codes 130 and 143. Both real-container regression tests failed on the reviewed code and pass after the fix. |
| [R3: public HTTP port](https://github.com/narumiruna/fitness/pull/3#discussion_r4240556221) | Compose's rendered app port has no `host_ip`, while the database port already specifies loopback. `setupAdminAction` lets a caller create the first admin whenever no users exist. The new all-interface app publication exposes setup directly outside the documented HTTPS proxy. Local binding is sufficient for the documented local setup and host proxy deployment. | P1: direct public access to an unclaimed installation | Already addressed by this review fix. Compose binds app port 8783 to 127.0.0.1. README documents the host HTTPS proxy boundary. Rendered Compose configuration and running container inspection both confirm loopback-only publication. |

## Scope and publication

Both confirmed defects are introduced by this PR and are in scope. No feedback
item is deferred, unclear, or blocked. No P0 incident was found. The target remains
open, so fixes will be signed and pushed to its current branch. Publish supporting
replies for all three items, then resolve each thread only after publication.

## Validation

- `npm run test:db-init`: all five tests pass. The two new tests use real detached containers held unavailable during readiness polling; SIGINT and SIGTERM remove their containers and return exit codes 130 and 143. Both tests reproduced the leak before the fix.
- `npm run check`, `prek run -a`, and `git diff --check`: pass.
- The production Next.js build and `docker compose build`: pass.
- Rendered Compose configuration sets `host_ip` to `127.0.0.1`. A fresh Compose deployment starts PostgreSQL and applies migrations; Docker inspection reports app binding `127.0.0.1:8783`.
- All six browser tests pass against that Compose deployment on port 8783, with UTC fixtures matching the container. These cover setup, authentication, workflows, raw SQL totals, isolation, and responsive layouts. Temporary browser configuration, containers, network, and volume were removed; port 8783 has no listener.
- Two host Node.js 26 production browser attempts failed at unchanged sign-out navigation and chart-tooltip checks. The complete suite passes against the supported Node.js 24 Docker image. These failures do not involve the reviewed signal cancellation or port binding; no unrelated UI changes were made.
- Unchanged migration and adapter evidence from the initial PR is reused. No schema, authentication, or runtime feature change is part of this fix.

The signed commit containing this ledger identifies the fixes. Publish that
commit before resolving threads. GitHub thread replies record the published
commit and verified outcomes.
