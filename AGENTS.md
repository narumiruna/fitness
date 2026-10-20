# Repository Guidelines

## Documentation

- Keep UI strings in English and Traditional Chinese dictionaries under `apps/web/src/lib/` with matching typed keys and placeholders.
- Keep release instructions in `docs/releasing.md` and verification evidence in `docs/hono-migration-verification.md`.

## Code style

- Use strict TypeScript and Biome for formatting, linting, and import organization.
- Prefer Radix Themes for components, Radix Primitives for other accessible interactions, and Radix Icons for icons.
- Put Vite/React code in `apps/web`, Hono routes and server services in `apps/api`, environment-neutral rules in `packages/core`, and HTTP schemas in `packages/contracts`.
- Keep dependencies directed from apps to packages; packages must not import apps, and web code must not import API implementation or Prisma.
- Keep route handlers small and put validation and related service logic at the server boundary.

## Commands

Run commands from the repository root.

- Install locked dependencies and generate Prisma clients: `npm ci`.
- Build shared packages: `npm run build:packages`.
- Start the loopback development stack on web port 8784 and API port 8785: `npm run dev`.
- Generate both Prisma clients: `npm run db:generate`.
- Synchronize local SQLite without destructive changes: `npm run db:push`.
- Create a PostgreSQL migration against an authorized non-production database: `npm run db:migrate`.
- Seed development explicitly with `admin` / `admin`: `npm run db:seed`.
- Format: `npm run format`.
- Lint and typecheck every workspace: `npm run check`.
- Build the API, shared packages, and browser app: `npm run build`.
- Run pure tests: `npm test`.
- Run disposable SQLite HTTP tests: `npm run test:api`.
- Run database upgrade tests: `npm run test:training:sqlite` and `npm run test:training:postgres`.
- Run browser workflows: `npm run test:ui` and `npm run test:ui:production`.
- Run the pre-commit gate: `prek run -a`.

## Boundaries

- [UNREVIEWED] Keep development isolated in SQLite at `.cache/dev.db`; ignore inherited PostgreSQL URLs in development and resolve relative file URLs from the repository root.
- [UNREVIEWED] Treat `compose.yaml`, the `fitness` Compose project, and `.github/workflows/deploy.yml` as production; do not operate or deploy those services without explicit production authorization.
- [UNREVIEWED] Keep `prisma/schema.prisma` as the canonical PostgreSQL schema and SQL migrations under `prisma/migrations/`; do not maintain or hand-edit a second SQLite schema.
- Do not edit or commit generated output, including `apps/api/src/generated/`, `prisma/.dev/`, `dist/`, `node_modules/`, databases, caches, and TypeScript build information.
- Do not stage `data/` unless the user explicitly requests data import/export work.
- [UNREVIEWED] Use disposable SQLite files and separate PostgreSQL test containers; never stop an existing service to free a test port.
- Keep Changesets versioning separate from deployment; do not publish packages, create release tags, or dispatch production workflows without explicit authorization.

## Security

- Store passwords only as bcrypt hashes and session tokens only as hashes; keep session cookies HttpOnly, SameSite=Lax, and Secure in production.
- Validate authentication, role, ownership, input, and mutation Origin on the API; browser route guards are not authorization.
- Use the configured exact production origin for passkeys and CSRF checks, not caller-supplied forwarded headers.
- Keep database URLs, passwords, tokens, passkey material, workout data, raw headers, and error messages out of logs.
- Keep the documented seed credentials unchanged unless the user changes that contract.

## Testing

- Run `npm run check` for code changes and `npm run build` for API, schema, route, or UI changes.
- Run relevant API, pure, and database tests for changed behavior; do not report unavailable Docker checks as passed.
- Keep browser specs under `apps/web/e2e/` and test runners/fixtures under `tests/`.
- Run UI workflows through `npm run test:ui` on port 8784 with disposable data, refuse server reuse, and stop the test's own processes afterward.
- Run `prek run -a` before committing and include actual verification results in the PR.

## Git and commits

- Stage only intended paths and keep the migration separate from unrelated work.
- Include a package changeset for user-visible changes or an empty changeset for docs/tooling-only PRs.
