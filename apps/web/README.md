# Fitness browser application

This private workspace contains the Vite React application. It requires JavaScript. `index.html` provides a message when JavaScript is disabled. This replaces Next.js progressive enhancement; it is an accepted migration behavior change.

## Commands

Run these commands from the repository root:

```sh
npm run dev --workspace @narumitw/fitness-web
npm run typecheck --workspace @narumitw/fitness-web
npm run build --workspace @narumitw/fitness-web
```

Vite listens on `127.0.0.1:8784` with `strictPort`. It proxies `/api` and `/data/export` to `127.0.0.1:8785`. The proxy preserves the browser Origin and cookies. Start the API with the root development command. Do not use a production database for browser tests.

## Boundaries

- `src/api/client.ts` validates responses and cancels stale requests. A 401 clears private queries and mounted drafts before sign-in. Query keys include the account and locale.
- `src/api/views.ts` reads the schemas from `@narumitw/fitness-contracts`. Calendar dates use local calendar parsing, not UTC parsing. Display dates in prior-session summaries remain strings.
- `src/api/actions.ts` sends explicit JSON operations or multipart CSV uploads. Mutations are not retried. Successful writes invalidate the view cache. Server redirects use React Router.
- `ActionForm` uses native validation and includes submitter fields. `SafeForm` keeps failed drafts and requires an explicit refresh after a session conflict. Neither component automatically resubmits a mutation.
- Workout and session request keys remain stable while a form is mounted. A lost response does not generate a new key. Account changes discard mounted private forms.
- Pages and pure components retain the Radix UI layout and English/Traditional Chinese dictionaries. Page modules load on demand.
- Browser source must not import Prisma, API implementations, Node modules, or database credentials. The test files can import API fixtures; they are not browser entry points.

The router preserves the existing root, authentication, workouts, calendar, reports, exercises, measurements, data transfer, user administration, account, and source paths. Missing records and denied access have separate states. Bootstrap loading does not render protected content or an unresolved locale.

## Tests

Browser specifications are in `e2e/`. The root runner owns disposable databases and server cleanup. Protocol interception uses `/api/actions/<export name>`, not Next.js page POSTs. `api-client.spec.ts` tests malformed responses, 401, 403, 404, network failures, request keys, and disabled automatic mutation retries.

The production server must serve `dist/` and provide SPA fallback for valid browser navigation. API and CSV routes must run before that fallback. The API workspace owns this server behavior.
