# Version-only releases

Changesets manage private workspace versions and changelogs. They do not publish
packages, create release tags, or deploy the application.

## Package policy

- Start each workspace package at `1.0.0` with `private: true`.
- Use independent versions. Do not add fixed or linked groups.
- Set `privatePackages.version` to `true` and `privatePackages.tag` to `false`.
- Set `updateInternalDependencies` to `patch`.
- Keep root tooling private and outside workspace releases.
- Apply this policy to all four packages:
  - `@narumitw/fitness-core`
  - `@narumitw/fitness-contracts`
  - `@narumitw/fitness-api`
  - `@narumitw/fitness-web`
- List only existing workspace names in a changeset; Changesets rejects unknown
  package names.
- Do not add a publish script, npm token, release tag command, or automatic
  release workflow.

## Changes in a PR

Each PR must add a new `.changeset/*.md` file. A change to an existing file does
not meet this rule.

For a user-visible change, run `npm run changeset` and select the affected
packages and version types. You can also create a uniquely named file without a
prompt:

```md
---
"@narumitw/fitness-core": patch
---

Describe the user-visible result.
```

Use an empty changeset for tooling, documentation, or private implementation
changes that do not need a version bump:

```md
---
---
```

Do not require a package version bump for every private implementation edit.
Empty changesets meet the PR presence rule without a version bump.

## PR checks

The verified default branch is `main`. CI must check out the PR head and fetch
complete history, including the PR base. Use the actual PR base reference, not a
fixed branch, for both commands:

```sh
node scripts/check-changesets.mjs --base origin/main
npm run changeset -- status --since=origin/main
node --test tests/changesets.test.mjs
```

The first command requires a new committed changeset relative to the merge base.
It accepts empty changesets. It excludes `README.md`, configuration changes,
uncommitted files, deleted files, and edits to existing changesets. The status
command validates Changesets content and package release plans. Missing history
or an unknown base is an error; fetch the base instead of skipping the check.

## Prepare a release PR

1. Create a release branch from the reviewed migration branch. Keep all release
   operations local. Do not use the production checkout.
2. Start with a clean working tree and run `npm ci`.
3. Run `npm run changeset -- status` and review the release plan.
4. Run `npm run version-packages`. This command must run `changeset version`
   followed by `npm install --package-lock-only --ignore-scripts`. It must not run
   publish, tagging, or deployment commands.
5. Review package versions, changelogs, internal dependency ranges, consumed
   changesets, and the root lockfile. All version and range values must agree.
   Empty changesets are consumed without a package version bump.
6. Run a clean installation, core tests, Changesets fixture tests, root checks,
   and the application build. Run the isolated UI smoke test and stop its server.
7. Stage only the reviewed release paths and open a manual release PR. Describe
   the version-only result and include verification results. The release PR also
   needs a new empty changeset because the version command consumed prior files.

The deployment workflow is manual only. Code and version PR merges do not deploy
production. Creating or merging a release PR does not authorize a deployment;
do not dispatch the production workflow without separate authorization.

## Deployment runner

The manual deployment runs on a self-hosted runner with Docker Compose installed.
Before building, the workflow checks Docker availability. If Docker is unavailable
on macOS and the selected context is `orbstack`, it runs `orbctl start` and waits
for Docker. The readiness step has a three-minute timeout and fails before the
build if Docker remains unavailable. It does not switch Docker contexts or reset
Docker data. Keep `orbctl` on the runner's PATH.

Starting OrbStack can resume existing production containers. Test workflow
changes with mocked commands; dispatch the workflow only with explicit production
authorization.

## Verify the version command safely

Run the version experiment in a disposable local clone of the reviewed commit:

```sh
scratch=$(mktemp -d)
git clone --no-hardlinks --no-local . "$scratch/fitness"
(
  cd "$scratch/fitness"
  npm ci
  npm run version-packages
  npm run changeset -- status
  git diff --check
  git diff -- package-lock.json packages apps .changeset
  npm ci
  npm run check
  npm run build
)
```

Confirm that a package changeset changes the intended version and changelog.
Check that internal dependency ranges and the lockfile match the new versions.
Repeat with an empty changeset and confirm that no package version changes.
Compare `git status --short` and `git tag --list` in the original checkout before
and after the experiment. Neither may change. Remove only the disposable clone
when the review is complete. Do not run `changeset publish`, create remote tags,
or change production services.

## Password hash compatibility and recovery

New and changed passwords use the `bcrypt-sha256:v1:` format: a domain-separated
SHA-256 digest, encoded as base64, is hashed with bcrypt at cost 12. The digest is
not stored. New hashes verify the full password, including bytes after byte 72.
Existing unmarked bcrypt hashes remain accepted without a data migration. They
retain the historical 72-byte limit until the account password is changed; the
original discarded suffix cannot be recovered.

Before a separately authorized rollout, verify new account creation, legacy
login, a password change whose suffix differs after byte 72, and revocation of
old sessions. The SQLite regressions cover these cases; PostgreSQL and HTTPS
checks require a separate available test environment.

After new-format hashes are written, do not roll back to a build that only
supports unmarked bcrypt. Retain the version-aware verifier in a rollback build.
Do not reset passwords or restore an old database over newer records as an
application rollback. This change does not authorize a deployment.

## Fitness MCP rollout and recovery

See [MCP setup and permissions](mcp.md) and the MCP section of
[verification evidence](hono-migration-verification.md). Connecting a development
client, merging the feature, or preparing this checklist does not authorize a
production deployment.

Before a separately authorized rollout:

1. Verify the configured exact HTTPS `PASSKEY_ORIGIN`. The OAuth issuer and MCP
   resource use this origin, not forwarded headers. Verify the public proxy
   preserves the expected Host and routes `/mcp`, `/oauth/authorize`,
   `/oauth/token`, and `/.well-known/` to the API without rewriting discovery.
2. Review the additive migration `20261022150000_mcp`. Retain the previous
   application image and an authorized database backup. Run the SQLite and
   PostgreSQL upgrade/backup tests; do not replace them with `db push` in production.
3. Verify HTTPS discovery, login, denial, read-only access, explicit write scope,
   recording retries, token refresh, and grant revocation using dummy accounts.
   Publish the exact Pi, Codex CLI, and Claude Code versions and protocols tested.
   Do not infer client compatibility from an HTTP-only test.
4. Confirm that shared ingress limits cover all API instances. The built-in
   per-user/client limits apply to one process. Do not expose an unlimited
   multi-instance authorization endpoint.
5. Check the consent privacy warning and English/Traditional Chinese UI. Verify
   logs do not contain credentials, raw errors, request arguments, or workout data.
6. Use the existing separately authorized migration/deployment procedure. Do not
   publish packages, create release tags, or dispatch a workflow as part of an MCP
   connection check.

For withdrawal, revoke connected grants and withdraw the MCP/OAuth protocol routes
through a reviewed application rollback. Keep browser login and the existing
Fitness API available. Leave added tables in place so both application revisions
can run. Do not delete saved workouts, drop receipt tombstones, or restore an old
database over new user records as a feature rollback. A lost write response is
resolved with the same `operationId`, not a replacement insertion.

Pre-registered public OAuth clients can be created by an authorized database
operator through `McpClient`. Store `redirectUris` as a JSON string array and set
`preRegistered` to true. Use an exact HTTPS callback or an explicitly registered
loopback HTTP callback. Only loopback port variation is permitted; host and path
must match. Do not store a client secret for these public CLI clients or add an
unauthenticated registration route. Prefer CIMD for the documented launch clients.
