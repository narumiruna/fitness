# Fitness

A multi-user strength training tracker built with Vite, React, Hono, TypeScript,
Prisma, Radix UI, and Biome. PostgreSQL is used in production; development uses
SQLite. The browser app requires JavaScript.

## Structure

```text
apps/web             React browser app, dictionaries, and Playwright specs
apps/api             Hono HTTP API, services, authentication, and server tests
packages/core        Environment-neutral training, calendar, and calculation rules
packages/contracts   HTTP schemas, DTOs, and error codes
prisma/              Canonical PostgreSQL schema, migrations, and development seed
scripts/             Repository and database tools
tests/               Integration fixtures and isolated test runners
```

Dependencies point from apps to packages. The browser must not import Prisma or
API implementation. See [API contracts](apps/api/README.md) for endpoints,
permissions, serialization, and transaction behavior.

## Development

Use Node.js 24 or later and npm. Run commands from the repository root:

```bash
npm ci
npm run dev
```

Open <http://127.0.0.1:8784>. Vite proxies `/api` and `/data/export` to the Hono
server on loopback port 8785. Both ports must be free. Startup refuses occupied
ports and does not stop another service. Shared packages are built and watched;
shutdown stops the stack's own child processes.

Development uses `.cache/dev.db`; it ignores inherited PostgreSQL `DATABASE_URL`
values and production `PASSKEY_ORIGIN`. An optional `file:` URL selects another
SQLite file. Relative paths resolve from the repository root, not the current
workspace. Environment precedence is the existing process, `.env.development.local`,
`.env.local`, `.env.development`, then `.env`. Test mode skips `.env.local`.

`npm run dev` generates both Prisma clients and synchronizes SQLite before the
servers start. It does not seed accounts, reset data, or accept destructive schema
changes. Initialization failures prevent startup. Empty databases show `/setup`.

The root `prisma/schema.prisma` remains the canonical PostgreSQL schema. SQLite's
schema at `prisma/.dev/schema.prisma` and clients under `apps/api/src/generated/`
are generated and ignored. Do not edit or commit them. After model changes, run
`npm run db:push` or restart development. Existing PostgreSQL migration contents
remain unchanged; `npm run db:migrate` requires an authorized non-production
PostgreSQL database and is not SQLite startup.

Run `npm run db:seed` explicitly to add development exercises and the `admin` /
`admin` account. It resets that account's password. Login fields remain empty.

## Authentication and Security

The API validates authentication, role, ownership, and request payloads. Client
route guards do not authorize requests. New passwords use a domain-separated
SHA-256 digest encoded as base64 before bcrypt (cost 12), stored with the
`bcrypt-sha256:v1:` format marker. This verifies the full password within the
existing 256-character limit. Legacy bcrypt hashes remain valid until the password
is changed; their original 72-byte limit cannot be reversed. Session records
store token hashes, not raw tokens. The `fitness_session` cookie remains
HttpOnly, SameSite=Lax, path `/`, with 30-day expiry and Secure in production.
Password changes revoke prior sessions and issue a replacement. Existing session
cookies and stored passkeys use the same formats as before the migration.

All mutation requests require a trusted Origin, including login, setup, and locale
changes. Missing or cross-site origins are rejected. Production requires the exact
public HTTPS origin in `PASSKEY_ORIGIN`; forwarded host/protocol headers are not
security inputs. Development accepts only the two documented loopback web origins.
There is no broad credentialed CORS configuration.

Open **Account → Passkeys** to register or remove a passkey. Registration requires
the current password and user verification. Sign-in requires a WebAuthn browser
and a device PIN, biometric check, or security key. Challenges are bound to an
HttpOnly cookie, expire after five minutes, and can be consumed once. A database
transaction enforces the 1,000-pending-challenge limit across app instances. Public
keys are stored; private keys remain with the authenticator. Keep a password for
recovery. Removing a passkey does not revoke existing sessions.

Use the same development hostname for registration and sign-in: `localhost` and
`127.0.0.1` have separate passkeys. Production requires HTTPS. Browser automation
uses virtual authenticators; it does not prove physical hardware or cross-device
passkey synchronization.

## Languages and UI

English and Traditional Chinese are supported before and after login. A valid
saved locale cookie overrides supported browser preferences, then English is the
fallback. zh-TW, zh-Hant, zh-HK, and zh-MO match Traditional Chinese; unspecified
zh and Simplified Chinese do not. The cookie lasts one year. Dates, numbers, and
document language use the selected locale. User text and workout date keys are
not translated or changed.

Add matching keys and placeholders in `apps/web/src/lib/messages.ts` and
`messages-zh-tw.ts`. Radix Themes, Primitives, and Icons provide controls and
accessible interactions. Forms keep drafts after rejected or lost responses,
disable duplicate submissions, and require explicit conflict recovery. The API
uses stable request keys and database versions where the existing workflows did.

## Checks

Build shared output before focused tests after a fresh installation:

```bash
npm run build:packages
npm run check
npm test
npm run build
npm run test:api
npm run test:api:postgres
npm run test:db-init
npm run test:training:sqlite
npm run test:training:postgres
npm run test:ui
npm run test:ui -- apps/web/e2e/measurements.spec.ts
npm run test:ui:production
prek run -a
```

SQLite HTTP and browser tests create disposable files. PostgreSQL, production-mode
UI, database cleanup, and container tests require Docker and use isolated test
containers, not development or production data. Browser tests require Google
Chrome, use port 8784, refuse to reuse servers, and clean up their own resources.
The production-mode runner uses test TLS and a disposable PostgreSQL instance.
Tests cover workflows, user isolation, keyboard focus, form behavior, axe checks,
and layouts from 320px to 1440px. Failure traces/screenshots go to `test-results/`.

Use `npm run format` for formatting or `npm run biome:check -- --write` for safe
Biome fixes. Husky runs the root check; `prek run -a` also runs lint/type checks.
See [migration verification](docs/hono-migration-verification.md) for actual
results and unverified paths; unavailable checks are not passed checks.

## Production

Hono serves both the compiled browser app and API on port 8783. The app container
runs as non-root and applies existing Prisma migrations before listening. Startup
fails if migration, origin validation, or database connection fails. It does not
seed development accounts. The existing PostgreSQL volume is unchanged.

`compose.yaml`, the `fitness` Compose project, and the deployment workflow are
production infrastructure. Building, replacing, stopping, resetting, or deploying
these services requires explicit production authorization. The deployment
workflow is manual only; code merges and Changesets version PRs do not deploy.
No package publication or release tags are part of the workflow.

Before an authorized deployment, set a URL-safe `POSTGRES_PASSWORD` and the exact
public HTTPS `PASSKEY_ORIGIN`. Compose forwards both values; it refuses a missing
origin. Manual GitHub deployment requires the `POSTGRES_PASSWORD` secret and
`PASSKEY_ORIGIN` repository variable. Adding a host environment file alone does
not configure a GitHub variable. No values are created by this migration.

Use an HTTPS reverse proxy to reach port 8783 and restrict direct HTTP access with
the host firewall. Port 8783 remains published on all host interfaces; PostgreSQL
port 5432 remains loopback-only. Cookies are shared across ports for the same host;
use a separate browser profile for manual development checks.

Never use production Compose for a test. To check an image, build a distinct test
tag `fitness-logging-test:local` and use `npm run test:logging:docker`. It creates
its own database, network, and app containers. Do not publish the image.

## Logging

Pino writes redacted JSON to stdout. HTTP middleware generates `requestId` and
returns `x-request-id`; caller correlation IDs are ignored. Request, action,
authentication, and database logs share the async request context. Logs include
safe status/duration and cookie-presence diagnostics, not cookie values.

Passwords, session/challenge values or hashes, passkey material/names, request
bodies, raw headers, query strings, workout data, database URLs, SQL parameters,
and error messages/causes are excluded. Error type/code/stack frames remain.
Restrict log access and configure retention through deployment infrastructure.

## Training and Data

Weights use kilograms. See [training features](docs/training-features.md) and
[training verification](docs/training-verification.md) for feature details.
The app CSV v1 and local markdown CSV formats remain separate and unchanged.
`/data/export` remains a private, no-store download. Import confirmation is atomic
and retains duplicate and retry protections. Existing `workouts:export-csv` and
`workouts:import-csv` commands remain available for explicit local data work.

## Versions and Releases

All four workspaces are private. Changesets manages independent versions and
changelogs without npm publication or version tags. Add a package changeset for
user-visible changes or an empty changeset for tooling/docs-only PRs. See
[version-only releases](docs/releasing.md).

## License

AGPL-3.0-only. The `/source` page links the repository source and license.
