# Fitness

A multi-user strength training tracker built with Next.js, TypeScript, Prisma,
PostgreSQL in production, SQLite in development, Radix UI, and Biome.

## Languages

Use the language selector in the header to switch between English and Traditional
Chinese. It is available before and after sign-in. The selected language is saved
in a cookie for one year and takes priority over the browser language. Without a
valid saved choice, the app uses the browser's supported language preference,
then falls back to English. Traditional Chinese tags (`zh-TW`, `zh-Hant`,
`zh-HK`, and `zh-MO`) match `zh-TW`; Simplified Chinese tags and an unspecified
`zh` preference do not. Dates, numbers, and document language use the same
locale. Language changes do not translate user-entered data or change stored
workout dates, values, or exercise names.

Add English UI strings in `src/lib/messages.ts` and matching Traditional Chinese
strings in `src/lib/messages-zh-tw.ts`. The dictionaries have the same typed keys.
Keep message placeholders unchanged in translations. Server components use
`getDictionary()` from `src/lib/i18n.ts`; pass translated labels to client
components.

```bash
npm run test:i18n
npm run test:ui -- tests/i18n.spec.ts
```

## Development

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:8784`. The development server binds only to loopback
and uses SQLite at `.cache/dev.db`; no Docker or PostgreSQL server is required.
Development ignores PostgreSQL `DATABASE_URL` values, including production
values inherited from the shell or environment files. An optional `file:` URL
selects another SQLite file. Relative file paths resolve from the repository root.
Development uses the same environment-file load order as Next.js.

`npm run dev` generates both Prisma clients and synchronizes the SQLite schema
before starting Next.js. Startup does not seed or reset accounts, delete records,
or accept destructive schema changes. Initialization failures prevent startup.
An empty database redirects to `/setup`, where you create a test admin account.

`prisma/schema.prisma` remains the canonical PostgreSQL schema. Client generation
derives an ignored SQLite schema at `prisma/.dev/schema.prisma` and generates a
separate client at `src/generated/prisma-sqlite/`. Do not edit these generated
files. After model changes, restart development or run `npm run db:push` to
synchronize SQLite. PostgreSQL migrations remain under `prisma/migrations/`;
`npm run db:migrate` is a PostgreSQL migration command, not a development SQLite
startup step. Never run it against production for development checks.

Production still uses PostgreSQL, the existing migrations, and port `8783`.
Do not stop production to free a test port. Browser checks use port `8784` and
separate test data. Use a separate browser profile for manual checks if production
also uses a loopback host, because cookies are shared across ports.

`npm install` configures Husky Git hooks through the `prepare` script.
The pre-commit hook calls `script/pre-commit.sh` to run `biome ci` and TypeScript checks without changing files.
Run `sh ./script/pre-commit.sh` to check manually.

Development seed credentials:

- Username: `admin`
- Password: `admin`

Run `npm run db:seed` explicitly if you want the development account. This command
sets the `admin` password to `admin` and adds sample exercises. Login fields start
empty in development and production.

## Production Docker

`compose.yaml` and `.github/workflows/deploy.yml` manage production. Do not use
these services for development checks. The following commands are production
operations and require explicit production authorization:


```bash
docker compose up --build -d
docker compose logs -f fitness
docker compose down
```

The app port `8783` is published on all host interfaces. Other devices can reach
it at `http://<server-ip>:8783` if the host firewall permits access. Production
session cookies require HTTPS, so use an HTTPS reverse proxy that connects to
`http://127.0.0.1:8783` for login and account setup at `/setup`. Restrict port
`8783` with the host firewall so it cannot bypass the proxy's access controls.

The app container runs as a non-root user. Compose waits for PostgreSQL to be
healthy, then the app applies existing Prisma migrations before startup. A
migration failure prevents the server from starting. It does not seed development
accounts. PostgreSQL data is stored in the `postgres-data` named volume and
survives container replacement and `docker compose down`.
`docker compose down -v` deletes this data.

The database uses `fitness` as its username, database name, and default password
for local use. Set `POSTGRES_PASSWORD` in `.env` before the first production start;
use a URL-safe password because Compose includes it in `DATABASE_URL`. Changing
this variable does not change the password of an existing database. PostgreSQL
port `5432` is published only on the local host. If you change the password for
local development, also set `DATABASE_URL` to the matching connection string.

This PostgreSQL migration history starts a new database. Existing SQLite files
are not imported or modified.

Local environment files, databases, and workout data are excluded from the build
context.

## Passkeys

Sign in with your password, open **Account**, then select **Passkeys**.
Enter a passkey name and your current password, then select **Add passkey**.
Use **Sign in with a passkey** on the login page for password-free sign-in.
The account page lists your passkeys and lets you remove them. Keep your password
for recovery if you lose access to all passkeys. Removing a passkey prevents new
sign-ins with that key; it does not end existing sessions.

Passkeys require a WebAuthn-compatible browser and a device PIN, biometric check,
or security key with user verification. Development supports HTTP only on
`localhost` and `127.0.0.1`. These hosts have separate passkeys; use the same host
for registration and sign-in.

Production requires HTTPS and `PASSKEY_ORIGIN` in the app process environment,
for example `https://fitness.example.com` (no trailing slash or path). The exact
origin includes the port if it is not the default HTTPS port. The relying party
ID is its hostname. Do not derive this setting from forwarded request headers.
Configure the app container environment through your authorized deployment process;
adding a value to a host `.env` file alone does not pass it into the container.
Apply the included PostgreSQL migration before using the feature. This change
does not deploy or modify production services.

Registration requires a valid session and the current password. Sign-in verifies
the challenge, origin, relying party ID, signature, user handle, and user
verification. Challenges expire after five minutes, are bound to an HttpOnly
cookie, and can be used only once. Public keys and counters are stored in the
database; private keys stay with the authenticator.

The database stores at most 1,000 pending challenges across all app instances.
Cleanup, the capacity check, and insertion use one serializable transaction;
requests without cookies cannot bypass the limit. A browser can replace its prior
challenge at capacity. If no slot is available, passkey option issuance fails
without inserting a record or setting a new challenge cookie. Retry after a
challenge expires or use password sign-in.

```bash
npm run test:ui -- tests/passkeys.spec.ts tests/passkey-challenges.spec.ts
npm run test:ui:production -- tests/passkey-challenges.spec.ts
```

The browser test uses Chrome's virtual authenticator and a disposable SQLite
file. It checks registration, incorrect passwords, expired challenges, invalid
signatures, sign-in, replay rejection, removal, and cookie-free issuance at
capacity. Database tests check concurrent issuance, replacement, and expiry
recovery on SQLite and disposable PostgreSQL. These tests do not verify physical
biometric hardware or cross-device passkey synchronization.

## Logging

Application logs use Pino and write one JSON object per line to stdout at
`info` level. Docker captures these records:

```bash
docker compose logs --tail=100 fitness
docker compose logs --since=5m fitness
npm run test:logging
# Use a separate test image; never rebuild production for a test.
docker build -t fitness-logging-test:local .
npm run test:logging:docker
```

Each page or action request gets a server-generated `requestId`, also returned
in the `x-request-id` response header. Static assets are excluded. Request logs
record receipt, not final response status. Server actions record their name,
duration, completion, framework control flow (including redirects), or failure.
Authentication and action database logs share the request ID. Other database
operations record their model, operation, duration, and failure without SQL or
parameters. Server startup, request errors, seed, and CSV scripts also use Pino.
Next.js startup output and Prisma CLI migration output remain in their native
format.

For a login loop, find `auth.login_succeeded`, then `session.cookie_set`.
Check the cookie's `secure` field and the request's `protocol` and
`originProtocol`. `session.secure_cookie_over_http` warns about HTTP access
with a Secure cookie; some browsers permit Secure cookies on loopback hosts.
Forwarded protocol headers are diagnostic hints, not trusted security inputs.
On the next request, `session.missing_cookie` means no session cookie arrived.
`session.not_found` means the cookie did not match a stored session.
`session.expired` means the session expired. `auth.required` records the
redirect back to login. `session.authenticated` records a valid session.
A missing cookie alone does not prove why the browser omitted it.

All five passkey actions use the action logger. Registration records
`auth.passkey_registered` or `auth.passkey_registration_failed`; sign-in records
`auth.passkey_login_succeeded` or `auth.passkey_login_failed`. Rejected verification
returns `false` to the UI and records the failure outcome before `action.completed`.
Thrown option-issuance errors, including capacity rejection, record `action.failed`.
Passkey logs omit credential IDs, challenge values, signatures, public keys,
passkey names, and raw verification responses.

Logs do not record passwords, token values or hashes, raw headers, form data,
query strings, workout content, database URLs, or SQL parameters. Error logs
keep the error type, code, and stack frames but omit messages and causes because
these can contain private data. User IDs and database session IDs are diagnostic
identifiers, not authentication credentials. Restrict access to Docker logs and
set retention through the deployment's logging system. No logging transport,
log files, or new environment variables are required.

## Checks

```bash
npm run check       # Biome CI and TypeScript checks
npm run biome:ci    # Biome CI checks without changing files
npm run biome:check # Biome formatting, lint, and import checks
npm run biome:format # Formatting checks only
npm run format     # Apply formatting changes
npm run build
npm run test:db-init # Database initialization and data preservation checks
prek run -a
```

Run `npm run biome:check -- --write` to apply safe Biome fixes.

## UI

Radix Themes provides shared controls, cards, tables, typography, and layout.
The root theme uses light appearance, teal accent, and slate gray. Radix Icons
provides navigation and action icons. The alias disclosure uses Radix Primitives.
Calendar cells and statistical bars remain custom components styled with Themes
and Radix Colors tokens in `src/app/globals.css`.

`src/components/form-select.tsx` preserves native form values, external form
association, form reset behavior, and the selected label during server rendering.
Workout set editors remount after saved values change so desktop and mobile forms
do not retain different values. Buttons and links use `highContrast` to meet text
contrast requirements on tinted backgrounds.

## Training features

Workout weights use kilograms. See [training features](docs/training-features.md)
for previous-session entry, weekly consistency, set types and RIR, active sessions,
exercise metadata, progression, schedules, measurements, app CSV, and migration recovery.
See [delivery evidence](docs/training-verification.md) for verification results and release limits.

```bash
npm run test:training           # Pure TypeScript rules and CSV tests
npm run test:training:sqlite    # Disposable SQLite upgrades and integration
npm run test:training:postgres  # Disposable PostgreSQL upgrades and integration
```

The PostgreSQL command requires Docker. None of these commands uses a developer
or production database.

## Browser tests

Install Google Chrome and start Docker before running the browser tests.
Port `8784` must be free; the tests refuse to reuse an existing server. Do not
stop another service to free a port unless you own that development service.

```bash
npm run test:ui             # Development server
npm run test:ui:production  # Build and test the production server
```

`npm run test:ui` starts a development server at `http://localhost:8784` with a
temporary SQLite file. It does not require Docker or use `.cache/dev.db`.
`npm run test:ui:production` uses the same test port with a disposable PostgreSQL
container and the existing migrations; it requires Docker. Neither command
uses production data or services. The runner stops its own server and removes
its temporary database when the run ends. `npm run test:db-init` tests SQLite
initialization and PostgreSQL test-container cleanup; its cleanup checks require
Docker.

Tests cover account, admin, exercise, workout, template, filter, statistics, and
calendar workflows. They check keyboard focus, themed portals, native validation,
form values, reset behavior, user data isolation, and layouts from 320px to 1440px.
Axe checks WCAG A/AA rules on desktop and mobile views. Screenshots and failure
traces are saved under the ignored `test-results/` directory.

The tests check password input types and autocomplete attributes. They do not
access saved passwords or test a browser password manager's stored credentials.
