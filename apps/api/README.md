# Fitness API

`createApp()` in `src/app.ts` returns a Hono application. Use `app.request()` for
HTTP tests. `createServerApp()` adds static files and browser navigation.
`startServer()` connects to the database before it opens the network port.
Root commands own schema synchronization and production migrations.

## HTTP contract

- `GET /api/bootstrap` returns `bootstrapSchema`: user, setup status, and locale.
- `POST /api/actions/<name>` returns `ActionEnvelope`: `{ result?, redirect? }`.
  - Names are listed in `actionNames` in `@narumitw/fitness-contracts`.
  - Normal form requests use a JSON object with string values. Repeated fields
    use arrays of strings. The API creates the service's `FormData`.
  - Both CSV actions require multipart `file`; confirmation also uses the
    `mappings` JSON string field.
  - Passkey requests use the exported structured request schemas.
  - Locale uses `{ locale }`. Requests without parameters use `{}`.
- `GET /data/export` and `/api/data/export` download `fitness-workouts-v1.csv`.
- Page reads return the corresponding schema in `viewSchemas`.
  - Workout, measurement, planned, and schedule dates use `YYYY-MM-DD`.
  - Event timestamps use ISO UTC strings. Previous-session display dates retain
    the resolved locale, as in the previous service.
  - Response schemas select public fields. Credentials, token hashes, public-key
    bytes, counters, internal fingerprints, and creation keys are not page DTOs.

All mutation requests need an exact trusted `Origin`, including anonymous login,
setup, locale, and passkey requests. Production uses `PASSKEY_ORIGIN` and does not
use forwarded headers for authorization. Development accepts only HTTP loopback
origins on port 8784 and ignores an inherited production origin. There is no CORS
access policy. `trustedOrigin` in the app factory supports isolated HTTP tests.

JSON bodies are limited to 1 MiB. CSV files remain limited to 5 MiB and 20,000
rows. Multipart parsing has a separate 64 KiB allowance plus a bounded mapping
allowance for confirmation. Limits apply to actual bytes read, not a trusted
`Content-Length` value.

Errors use `{ error: { code, requestId } }`: validation 400, authentication 401,
origin or permission 403, missing resources 404, conflict 409, body limit 413,
media type 415, unsupported method 405, challenge capacity 503, and sanitized
internal failure 500. Owner-scoped workout reads and referenced workout/source
lookups return 404 without disclosing another user's data. Idempotent deletes
retain their existing no-op behavior. Session form outcomes retain the existing
`result.error` codes, including `sessionConflict`, rather than exposing an error
message. Invalid password login retains its `/login?error=invalid` navigation.

## Page-read matrix

All routes require a session. `users` also requires `ADMIN`.

| GET route suffix under `/api/views/` | Schema key | Read behavior |
| --- | --- | --- |
| `workouts` | `workouts` | Search, month, exercise, notes, 20-row pagination, completed metrics, ongoing sessions, templates, mini-calendar, planning |
| `workouts/new` | `new` | Stable draft key and validated initial date |
| `workouts/:id` | `workout` | Owned workout, ordered sets, exercise options, previous sessions, progression previews |
| `calendar` | `calendar` | Calendar grid range, completed-set metrics, effective schedules, planned sessions |
| `stats` | `stats` | Range-aware and all-time metrics, records, distribution, consistency history, current-week muscle sets |
| `exercises` | `exercises` | Name/alias search, muscle/equipment filters, alphabetical/recent sorting, usage, muscle groups |
| `exercises/:id` | `exercise` | Catalog metadata and only the current user's completed history |
| `measurements` | `measurements` | Current user's measurement history and nullable goal |
| `users` | `users` | Safe account administration fields |
| `passkeys` | `passkeys` | Current user's safe credential list |
| `dashboard` | `dashboard` | Completed mini-calendar dates, planning, report inputs |
| `data` | `data` | Public exercise choices for import |

The workouts view includes `ongoingSessions`: owned `ACTIVE`/`PAUSED` summaries
with `id`, calendar `date`, nullable `title`, `state`, `totalSets`, and
`completedSets`. This list is independent of history filters and pagination. It
includes all ongoing sessions, ordered by update time descending and ID ascending.
Set counts include all prescribed set types; this read does not resume a session
or change its data.

## Mutation matrix

`src/lib/validation.ts` preserves the service input schemas. The request route
also validates JSON string fields or the shared structured passkey schemas.
`tests/http.test.ts` exercises the families below through HTTP; the root training
integration suite exercises transaction and progression rules directly.

| Action names | Permission | Write boundary |
| --- | --- | --- |
| `loginAction`, `logoutAction` | Anonymous/current token | Hashed 30-day session; user lock during session creation |
| `setupAdminAction` | Empty user table | Serializable count and create |
| `changePasswordAction` | Session and current password | Password CAS and session revocation in one transaction; checked replacement session |
| `createUserAction` | Admin | Bcrypt account creation |
| `passkeyRegistrationOptions`, `registerPasskey` | Session; options also require current password | Five-minute user-bound challenge, one-time consume, verified credential creation |
| `passkeyAuthenticationOptions`, `authenticatePasskey` | Anonymous | Serializable bounded challenge insert; user verification, counter CAS, session |
| `deletePasskey` | Credential owner | Owner-scoped deletion |
| `createWorkoutAction` | Session | User-row serialization and stable creation key |
| `updateWorkoutAction`, `deleteWorkoutAction` | Workout owner | Ownership check; metadata version increment/deletion |
| `duplicateWorkoutAction`, `saveWorkoutTemplateAction` | Completed workout owner | Copy completed sets only |
| `createWorkoutFromTemplateAction` | Template owner | Copy template as a completed workout |
| `deleteWorkoutTemplateAction` | Template owner | User lock, future-schedule cleanup, cutoff update, deletion in one transaction |
| `createWorkoutSetAction`, `updateWorkoutSetAction`, `deleteWorkoutSetAction` | Completed workout owner | Workout lock and set write in one transaction |
| `startSessionAction` | Source owner | Stable start key, user lock, scheduled uniqueness, source checks |
| `editSessionSetAction`, `changeSessionAction` | Workout owner | Submitted version CAS, actual-entry state, timing, finish/partial-finish rules |
| `saveProgressionRuleAction`, `acceptProgressionAction` | Template/session owner | User lock; source/version/target checks for acceptance |
| `saveScheduleAction` | Template owner | User lock and effective-date schedule replacement |
| `createExerciseAction`, `createExerciseAliasAction` | Session | Catalog creation and alias uniqueness |
| `updateExerciseAction`, `saveMetadataAction` | Exercise creator or admin | Permission check inside transaction |
| `saveMeasurementAction`, `deleteMeasurementAction`, `saveGoalAction` | Record owner | Same-date upsert, owner deletion, nullable-goal upsert |
| `previewImportAction`, `confirmImportAction` | Session | Bounded preview; atomic mapping, fingerprint and multiplicity-aware confirmation |
| `setLocaleAction` | Anonymous | Supported locale; one-year HttpOnly cookie |

## Concurrency disposition

- Setup count/create now uses serializable isolation. Competing setup transactions
  must not both commit. A serialization conflict is a 409, not an implicit retry.
- Password change and revocation now use one transaction and a password-hash CAS.
  Login session creation checks the verified hash under the same user-row lock.
  A previously verified password cannot issue a session after a password change.
- Existing workout metadata forms do not submit a version. Their updates still
  increment the version, but concurrent metadata edits remain last-write-wins.
  This pre-existing limitation is retained; these edits are not claimed to be
  race-safe. Session actuals and transitions retain submitted-version checks.

## Verification limits

API and contracts TypeScript builds, contracts tests, and disposable SQLite HTTP
and boundary tests pass. The HTTP tests include all page DTOs, authorization,
CSRF, malformed/bounded input, stable keys, stale sessions, CSV, challenge
replacement/capacity, replay rejection, password revocation, locale rules, and
static file/SPA boundaries.

Isolated PostgreSQL execution was attempted but is blocked because the Docker
daemon socket is unavailable. Real authenticator success, browser workflows,
network lifecycle, logging, and broader training concurrency
checks are coordinated by the root test runners. These checks are not claimed
passed by this workspace note. No production service or database was changed.
