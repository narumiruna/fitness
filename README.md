# Fitness

A multi-user strength training tracker built with Next.js, TypeScript, Prisma,
SQLite, Radix UI, and Biome.

## Development

```bash
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

The development server uses port `8783` by default.

`npm install` configures Husky Git hooks through the `prepare` script.
The pre-commit hook calls `script/pre-commit.sh` to run `biome ci` and TypeScript checks without changing files.
Run `sh ./script/pre-commit.sh` to check manually.

Development seed credentials:

- Username: `admin`
- Password: `admin`

`npm run dev` prefills the login form with these credentials.
Run `npm run db:seed` to create the development account before signing in.
Production login fields are empty.

## Checks

```bash
npm run check       # Biome CI and TypeScript checks
npm run biome:ci    # Biome CI checks without changing files
npm run biome:check # Biome formatting, lint, and import checks
npm run biome:format # Formatting checks only
npm run format     # Apply formatting changes
npm run build
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

Install Google Chrome before running the browser tests. Stop any server on port
`8783`; the tests refuse to reuse an existing server.

```bash
npm run test:ui             # Development server
npm run test:ui:production  # Build and test the production server
```

Each command creates a temporary SQLite database, applies existing migrations,
starts a server at `http://localhost:8783`, and removes the database after the run.
It does not use `dev.db` or seed personal workout data. The test runner stops its
server when the run ends.

Tests cover account, admin, exercise, workout, template, filter, statistics, and
calendar workflows. They check keyboard focus, themed portals, native validation,
form values, reset behavior, user data isolation, and layouts from 320px to 1440px.
Axe checks WCAG A/AA rules on desktop and mobile views. Screenshots and failure
traces are saved under the ignored `test-results/` directory.

The tests check password input types and autocomplete attributes. They do not
access saved passwords or test a browser password manager's stored credentials.
