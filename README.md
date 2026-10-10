# Fitness

A multi-user strength training tracker built with Next.js, TypeScript, Prisma,
SQLite, and Biome.

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
