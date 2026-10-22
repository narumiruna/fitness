# Fitness MCP

## Scope

Fitness exposes `/mcp` over Streamable HTTP. Agents can read their user's completed workouts, request calculated metrics, and record one complete workout at a time. Fitness validates ownership and values. The agent explains results.

The first release does not expose editing, deletion, live workout controls, body measurements, shared exercise changes, administrator tools, or arbitrary SQL. Correct a saved record in the Fitness UI.

## Connect a client

Use the same public HTTPS origin as the browser app. Replace `https://fitness.example.com` in these examples. Keep personal connections in user configuration, not this repository. Do not give an agent your Fitness password or session cookie.

### Pi

Add this entry to `~/.pi/agent/mcp.json`:

```json
{
  "mcpServers": {
    "fitness": {
      "type": "http",
      "url": "https://fitness.example.com/mcp",
      "oauth": { "clientRegistration": "cimd" }
    }
  }
}
```

Run `pi mcp login fitness` and approve access in the Fitness browser page. Run `pi mcp list` to check the connection. Pi needs the explicit CIMD selection because its default registration path can use DCR, which Fitness does not expose.

### Codex CLI

Add this entry to `~/.codex/config.toml`:

```toml
[mcp_servers.fitness]
url = "https://fitness.example.com/mcp"
```

Run `codex mcp login fitness`. Codex can select CIMD from the advertised authorization-server metadata. A scope-related `403` does not itself start a new login; run the login command again when additional permission is required.

### Claude Code

```sh
claude mcp add --transport http --scope user fitness https://fitness.example.com/mcp
claude mcp login fitness
```

You can also use `/mcp` in an interactive Claude Code session to sign in. Complete login before starting unattended runs.

### Permissions

- `fitness:read` permits reading the shared exercise catalog and your own completed records and metrics.
- `fitness:write` permits creating your own completed workouts. It does not imply read access or permit updates, deletion, or administrator access.
- Fitness initially advertises read access as its basic resource scope. A write request without permission returns an HTTP `403` scope challenge. Request both scopes when recording and reading are needed, then approve them in Fitness.
- OAuth consent grants a capability. Per-call confirmation depends on the agent host. A server hint is not proof that a user approved a particular write.
- Tool arguments never select a user. Each call uses its access token's owner, including calls from an administrator account.

Open **Account → Connected agents** in Fitness to inspect permissions and revoke a connection. Consent and connection pages show the client ID as well as its self-declared name. Verify the client ID before approval; the name alone does not establish identity. These pages cannot be embedded in a frame.

Revocation prevents later token refresh and tool calls. A write already committed before revocation is not undone. Changing a password invalidates browser sessions, not separately granted MCP access. During account recovery, revoke connected agents explicitly as well.

## Tools

| Tool | Purpose |
| --- | --- |
| `fitness_get_context` | Read account display name, units, granted scopes, date rules, and limits. |
| `fitness_search_exercises` | Find candidate exercise IDs using names and aliases. |
| `fitness_list_workouts` | Read bounded, paginated completed-workout summaries without notes. |
| `fitness_get_workout` | Read one owned completed workout and its performed sets. |
| `fitness_get_training_summary` | Calculate frequency, training days, total/working volume, and Sunday-based weekly totals. |
| `fitness_get_exercise_progress` | Read working-set progress and estimated one-rep maximum with source record IDs. |
| `fitness_record_workout` | Atomically record a completed workout and all its performed sets. |

Inputs and outputs are defined in `packages/contracts/src/mcp.ts`. Successful results include typed `structuredContent` and compatible text. Titles, aliases, and notes are untrusted data, not instructions. Analysis does not include notes.

### Record safely

Resolve exercise names to IDs first. If the exercise, date, unit, or performed values are ambiguous, ask the user. Do not turn planned sets into performed records.

```json
{
  "operationId": "462bf378-060d-4454-99fb-4874f9e33379",
  "date": "2026-10-22",
  "title": "Upper body",
  "sets": [
    {
      "exerciseId": "<ID from fitness_search_exercises>",
      "weightKg": 60,
      "reps": 8,
      "type": "WORKING",
      "rir": 2
    }
  ]
}
```

Use a new UUID for a new user-approved recording. Reuse the same UUID and payload after a timeout, disconnect, or lost response. The workout, sets, and payload-bound receipt commit in one transaction.

- An identical retry returns the saved workout ID without a new record.
- A different payload with the same operation ID returns `IDEMPOTENCY_CONFLICT`.
- If the saved workout was deleted in the UI, a retry returns `RESULT_REMOVED`; it does not recreate the workout.
- A different operation ID is a new write. If the prior operation ID is lost, inspect recent records before submitting again.
- A timeout or cancellation does not prove that a write failed. Resolve the outcome through the same operation ID.

### Units, dates, and limits

- Weight is kg. Volume is `kg_reps`. Fitness does not infer lb conversions.
- Dates are explicit `YYYY-MM-DD` local calendar dates. Range starts are inclusive and range ends are exclusive.
- Fitness does not store a user timezone. Do not use server UTC time to guess the date meant by “today.” Resolve relative dates in the user's known timezone or ask.
- A recording has 1–200 sets. Each set has finite weight 0–2000 kg and integer reps 1–1000. Optional RIR is 0–10 in steps of 0.5; missing RIR remains unknown.
- Workout pages contain at most 50 records. Exercise search pages contain at most 20 candidates. Follow `nextCursor` with the same query and account. A cursor is not an authorization credential.
- Query ranges are at most 366 days. Analysis rejects more than 50,000 performed sets or workout rows rather than returning incomplete totals. A single-workout result rejects more than 200 performed sets. Search bounds name/alias lists to 50 entries per exercise.
- Total volume includes warm-ups. Working-set volume and records exclude warm-ups. Estimated one-rep maximum uses Epley, `weightKg * (1 + reps / 30)`, and is an estimate, not a measured maximum.
- Empty results mean there are no matching recorded data. They do not prove zero real-world activity.

## Server operation

The server runs inside the existing Hono API process. Production uses the configured exact `PASSKEY_ORIGIN` for its issuer, resource URI, and trust checks. Caller-supplied forwarded headers cannot change these values. Development stays on loopback; Vite proxies `/mcp`, OAuth protocol routes, and discovery to the API.

Discovery endpoints:

- `/.well-known/oauth-protected-resource/mcp`
- `/.well-known/oauth-authorization-server`

OAuth uses authorization code flow with PKCE S256 and public clients. Authorization codes and access/refresh tokens are stored only as hashes. Codes expire after five minutes. Access tokens expire after 15 minutes. Refresh tokens rotate, with a 30-day absolute grant lifetime. Reusing an old refresh token revokes its grant family, including newly issued access tokens. Concurrent refreshes using the same old token fail closed and can require a new login; clients must serialize refresh.

CIMD metadata is fetched over HTTPS with a five-second timeout, a 32 KiB limit, public-IP checks, DNS-pinned connections, and no redirects. Fitness does not fetch client logos. Pre-registered public clients are a fallback for clients that cannot use CIMD. Do not add an unauthenticated client-registration API.

MCP and token requests accept bearer/OAuth credentials, not browser cookies. Browser consent and revocation remain behind cookie authentication and mutation Origin checks. Missing Origin is allowed for machine requests; a supplied untrusted Origin is rejected. Production requires HTTPS. GET and DELETE on `/mcp` do not open sessions or subscriptions.

Transport supports modern revision `2026-07-28` and SDK-provided stateless legacy operation for `2025-11-25` and `2025-06-18`. The latter is required by the tested default Codex CLI 0.163.0 runtime. Modern requests require matching protocol metadata and mirrored headers. Do not use the deprecated `/sse` transport. Client/version support is measured separately in [verification evidence](hono-migration-verification.md).

MCP, authorization, and token responses have a 15-second deadline that starts before database token verification. In-flight work retains its admission slot until it settles. Request bodies are limited to 256 KiB for MCP and 16 KiB for token/consent input. MCP limits are 60 requests per minute and four concurrent requests per user and per user/client pair in each API process; one account cannot exhaust a public host client ID's quota for every account. Before token lookup, MCP ingress allows 300 requests per minute and 16 concurrent requests per socket peer. Authorization ingress allows 30 requests per minute with four concurrent requests per peer; token ingress allows 120 per minute with four concurrent requests per peer. A process-wide protective ceiling allows 1,200 requests per minute and 64 concurrent admitted requests across these endpoints. Do not use forwarded headers to select the peer. A reverse proxy can make multiple users share that peer quota; apply caller isolation at the authorized public ingress. Limit state is bounded to 2,000 keys per limiter and expires. Multi-process deployments require an ingress control shared across instances; local limits are not a global quota.

Expired authorization requests, codes, and token rows are cleaned in bounded batches on valid authorization requests. Used refresh rows remain until grant expiry for replay detection. Write receipts remain while the user account exists, including deletion tombstones. Account deletion cascades grants, tokens, requests, and receipts.

Logs include safe tool names, internal principal/client IDs, request IDs, durations, and outcome codes. They do not include tokens, raw headers, tool arguments/results, workout notes, or raw error messages.

## Client verification status

The native compatibility fixture verifies the core OAuth and seven-tool workflows without model requests or real credentials. Pi 1.4.0, Codex CLI 0.163.0 default/modern runtimes, and Claude Code 2.1.303 v1/v2 runtimes completed these workflows. See [native test details](../tests/mcp-clients.md) for the boundary of this evidence.

The full launch gate is not green: Claude Code and intermittently default Codex can race two refresh attempts after simultaneous `401` responses. Fitness correctly revokes the family on reuse; users then need to sign in again. Do not disable reuse detection to hide this client behavior. Native CIMD OAuth setup and normal host-session permission UI remain separate unverified paths. The live public Pi metadata resolver/cache probe passed, but that is not a native CIMD OAuth flow.

## Privacy and recovery

An authorized agent receives sensitive training records. The consent page explains transfer to the agent provider. Fitness cannot control that provider's retention or model-training policy. Keep captured test data disposable and use dummy accounts for compatibility checks.

If a client rejects authentication, check the configured origin, callback URI, issuer, registration method, and requested scopes. Do not disable audience, PKCE, Origin, or redirect validation to make it connect.

Deployment and withdrawal instructions are in [releasing.md](releasing.md). No deployment is authorized by connecting a development client or opening a pull request.
