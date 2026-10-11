# Pino logging

## Goal

Add safe JSON logs for server requests, actions, authentication, sessions, and database operations. Diagnose the Docker login loop without changing authentication policy.

## Plan

- [x] Inspect server entry points and Docker logs. Production uses Secure cookies; the existing logs do not record authentication events.
- [x] Add Pino, generated request IDs, safe error serialization, action timing, session outcomes, and database operation timing. Seed and CSV scripts also use Pino.
- [x] Test redaction, correlation, redirect handling, and HTTP cookie diagnostics. Five unit tests and the disposable Docker test pass. The Docker test also checks missing, invalid, expired, authenticated, and destroyed sessions.
- [x] Run checks and a production build. The production authentication workflow passes after adding a wait for logout completion to avoid a canceled request.
- [x] Confirm recovery of the existing Compose app without changing its services or credentials. PR #6 records the user's manual restart. Read-only `docker ps` now shows `fitness-fitness-1` running and `fitness-db-1` healthy. Earlier recovery was blocked by Prisma P1000 after service replacement lost the workflow-injected credential. No recovery operation was run during this follow-up.
- [x] Resolve the full production UI result. The trace showed that `tests/ui.spec.ts` focused chart markup inside Next.js's hidden streaming container. Wait for the point to be visible and verify focus before pressing Enter. Keep the tooltip assertion. A repeat run passed the chart check but exposed canceled logout before a subsequent login. Wait for the login redirect in both account-switch sequences. All six tests pass in two consecutive production-mode runs and in the final development-mode run.

## Rollback / Recovery

Revert the logging changes and rebuild the app image. Do not remove the PostgreSQL volume or change accounts. The application restart briefly interrupts requests.

## Completion Checklist

- [x] JSON logs contain no passwords, tokens, hashes, SQL parameters, form data, or query strings. Unit and disposable Docker assertions pass.
- [x] Check, logging tests, and production build pass. Database initialization and cleanup tests also pass.
- [x] Disposable Docker smoke test shows a correlated login diagnostic and does not use existing account data.
- [ ] The user repeats the original production login attempt and supplies its outcome and correlated diagnostics. Production is running, but disposable test results do not verify the original browser, host, protocol, or login loop. This remains blocked on user evidence; no credential rotation is needed for the verification performed here.

## Follow-up Verification

The implementation is already merged in PR #6. This follow-up uses branch
`narumi/fix/pino-logging-verification` from `origin/main` at `5c313a0`.

Passed:

- `npm run check` and `prek run -a`.
- `npm run test:logging`: five tests, including secret redaction and concurrent request correlation.
- `npm run test:dashboard`: eight tests.
- `npm run test:db-init`: eight tests on rerun. The first run timed out waiting for the SIGINT test container to reach readiness; both isolated cleanup tests and the full suite then passed without code changes. Cold Docker startup remains a test timing risk.
- `npm run build` and `docker build -t fitness-logging-test:local .`.
- `npm run test:logging:docker`: correlated login, redirects, HTTP Secure-cookie diagnostics, missing, invalid, expired, authenticated, and destroyed sessions; no test secrets in logs.
- `npm run test:ui`: six tests with disposable SQLite after both fixes.
- `npm run test:ui:production` followed by `node tests/run-ui.mjs --production`: all six tests pass in both consecutive disposable PostgreSQL runs after both fixes. Before the fixes, the tooltip assertion failed and two later tests did not run. An intermediate run passed the chart check but failed at the subsequent login because navigation canceled logout.

Test containers were removed and port `8784` has no listener after the tests.
Production services, credentials, account data, schema, and deployment workflows
were not changed. The unrelated `next-env.d.ts` change is excluded from the commit.
Keep this plan until the original production login result has evidence.
