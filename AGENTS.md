# Repository Guidelines

## Scope

- This repo is a Next.js App Router fitness tracker written in TypeScript.
- Keep user-facing UI text in English by default. Add strings through `src/lib/i18n.ts` so `zh-TW` can be filled in later.
- Use Prisma with SQLite for persistence. Schema lives in `prisma/schema.prisma`; migrations live in `prisma/migrations/`.
- Treat `src/generated/prisma/`, `.next/`, `node_modules/`, `*.db`, and `*.tsbuildinfo` as generated or local artifacts. Do not hand-edit or commit them.
- `data/` may contain local workout markdown data. Do not stage it unless the user explicitly asks for data import/export work.

## Commands

Run commands from the repository root.

- Install dependencies: `npm install`
- Start development server: `npm run dev` (uses port `8783`)
- Generate Prisma client: `npm run db:generate`
- Apply local migrations: `npm run db:migrate`
- Seed development data: `npm run db:seed` (`admin` / `admin`)
- Format: `npm run format`
- Lint and typecheck: `npm run check`
- Production build: `npm run build`
- Pre-commit gate: `prek run -a`

## Code Style

- Use Biome for formatting, linting, and import organization. Do not make manual formatting-only churn outside touched files.
- Keep TypeScript strict and server-side logic in server actions or `src/lib/*` helpers.
- Prefer small server actions in `src/app/actions/` and keep validation schemas in `src/lib/validation.ts`.
- Store passwords only as bcrypt hashes. Session cookies must stay HttpOnly and sessions should store token hashes, not raw tokens.

## Prisma and Data

- Change database shape in `prisma/schema.prisma`, then create a migration with `npm run db:migrate`.
- Prisma 7 uses a generated client output under `src/generated/prisma/`; import the client through `src/lib/prisma.ts`.
- If auth or seed behavior changes, keep `prisma/seed.ts` aligned with the documented development credentials unless the user changes that contract.

## Verification

- For most code changes, run `npm run check`.
- For route, server action, Prisma, or UI changes, also run `npm run build`.
- Before commit, run `prek run -a`; it runs Biome and TypeScript through `.pre-commit-config.yaml`.
- For UI workflow changes, use a browser smoke test on `http://localhost:8783` and stop the dev server afterward so the port is free.

## Git

- Keep commits focused. Stage only intended paths; do not use blanket staging.
- Include verification results in handoff or PR notes.
