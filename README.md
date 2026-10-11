# Fitness

A multi-user strength training tracker built with Next.js, TypeScript, Prisma,
PostgreSQL, Radix UI, and Biome.

## Development

```bash
npm install
docker compose up -d db
npm run dev
```

The development server uses port `8783` by default.

Docker Compose starts PostgreSQL on `localhost:5432`. The local development
connection defaults to `postgresql://fitness:fitness@localhost:5432/fitness`.
Set `DATABASE_URL` in `.env` or the process environment to use another database.
`npm run dev` applies existing Prisma migrations before starting Next.js.
Startup does not run the seed or reset existing accounts. If migrations fail,
the server does not start. An empty database redirects to `/setup`, where you
create the first admin account.

Use `npm run db:migrate` only when creating a new migration during development.

`npm install` configures Husky Git hooks through the `prepare` script.
The pre-commit hook calls `script/pre-commit.sh` to run `biome ci` and TypeScript checks without changing files.
Run `sh ./script/pre-commit.sh` to check manually.

Development seed credentials:

- Username: `admin`
- Password: `admin`

Run `npm run db:seed` explicitly if you want the development account. This command
sets the `admin` password to `admin` and adds sample exercises. Login fields start
empty in development and production.

## Docker

```bash
docker compose up --build -d
docker compose logs -f fitness
docker compose down
```

The production server listens on port `8783`. Open `http://localhost:8783`
and create the first admin account at `/setup`. For remote access, use an HTTPS
reverse proxy because production session cookies require a secure connection.

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

## Browser tests

Install Google Chrome and start Docker before running the browser tests.
Stop any server on port `8783`; the tests refuse to reuse an existing server.

```bash
npm run test:ui             # Development server
npm run test:ui:production  # Build and test the production server
```

Each command starts a temporary PostgreSQL container on a random local port,
applies existing migrations, and starts a server at `http://localhost:8783`.
It does not use the development database or seed personal workout data. The test
runner stops its server and removes the database container when the run ends.
`npm run test:db-init` also requires Docker and uses a separate temporary container.

Tests cover account, admin, exercise, workout, template, filter, statistics, and
calendar workflows. They check keyboard focus, themed portals, native validation,
form values, reset behavior, user data isolation, and layouts from 320px to 1440px.
Axe checks WCAG A/AA rules on desktop and mobile views. Screenshots and failure
traces are saved under the ignored `test-results/` directory.

The tests check password input types and autocomplete attributes. They do not
access saved passwords or test a browser password manager's stored credentials.
