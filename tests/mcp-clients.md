# Native MCP client compatibility tests

Run from the repository root:

```bash
npm run build:packages
npm run db:generate
node tests/mcp-clients.mjs
```

The runner requires the installed Pi, Codex CLI, and Claude Code executables. It does not install a host or change `package.json`. It uses the installed Pi JavaScript package next to its `dist/bundle/cli.js` executable.

A separate public-metadata probe uses the same disposable database and credential isolation:

```bash
node tests/mcp-clients.mjs --cimd
```

This mode permits one static public HTTPS GET to `https://pi.dev/oauth/client.json` through the real `resolveMcpClient()` service. It sends no credentials, user data, or model requests. It also checks the database cache. This probe passed on 2026-10-22 with the published redirect URIs `http://127.0.0.1/callback` and `http://localhost/callback`. It is not a native-host CIMD OAuth workflow.

## Native Pi CIMD mode

With the shared packages and Prisma clients already generated, run:

```bash
node tests/mcp-clients.mjs --native-cimd
```

This mode requires only installed Pi. It uses the same disposable Fitness server, database, allowlisted environment, scratch directories, Keychain block, native OAuth hooks, and cleanup as the general runner. It configures `oauth.clientRegistration = "cimd"` without `clientId`, `clientName`, or pre-registration. Fitness resolves the public Pi document during native authorization, not through a separate resolver probe.

The fixture permits exactly one external HTTPS GET to `https://pi.dev/oauth/client.json`, with only the resolver's `Accept: application/json` header and no body. It keeps the real resolver's DNS, public-address, TLS, response-size, timeout, and cache checks. Native `fetch` requests are limited to local Fitness and loopback callbacks, without automatic redirects. No credentials, workout data, or model requests go externally. Unknown, duplicate, and combined mode arguments are rejected before creating scratch data. The supported invocations are the general runner, `--cimd`, and `--native-cimd`.

On 2026-10-22, `node tests/mcp-clients.mjs --native-cimd` exited `0` on Node.js **v26.10.0** with Pi **1.4.0**, built-in `McpServerConnection` and `signInMcpServer`, Streamable HTTP, and observed protocol **`2025-11-25`**. Both authorization requests used client ID `https://pi.dev/oauth/client.json` and PKCE S256. Exact callback URIs were:

- `http://127.0.0.1:57172/callback` for read consent.
- `http://127.0.0.1:57180/callback` for explicit read/write consent.

The run passed all seven tools, HTTP `403` read-only write denial with no workout inserted, scope upgrade, record/read/analyze, retry without duplication, refresh after HTTP `401`, browser revocation, and subsequent HTTP `401` denial. It started with no client records, fetched metadata once, and verified a non-pre-registered client and unchanged cache expiry across both authorizations. It made zero model calls.

Concurrent refresh is intentionally not run in this separate mode. The unchanged general client gate still requires it and still exits nonzero for the recorded Claude/default Codex refresh races. This result establishes native **Pi CIMD only**, not native Codex or Claude CIMD, full-session tool exposure, or human per-write approval.

## Test boundary

- Use a new temporary directory, SQLite database, browser sessions, public OAuth clients, and synthetic workouts.
- Bind Fitness to an OS-selected loopback port. Do not use ports 8784 or 8785 or reuse an existing server.
- Start hosts outside the repository with an allowlisted environment and scratch HOME, XDG, Pi, Codex, and Claude directories. Mask repository dotenv variable names with empty values before API imports.
- Force Codex's MCP and CLI credential stores to `file` under its scratch `CODEX_HOME`. Block macOS `security` through a scratch PATH executable. Claude uses its scratch plaintext credential fallback; it must not read or change the user's Keychain. `--bare` is not suitable here because it also prevents MCP OAuth credential persistence.
- Do not send a model turn. The JSON-lines driver permits only the machine methods used by this test. Claude must advertise `mcp_call_result_not_for_model_v1`; each call sets `result_not_for_model: true` to prevent token-count uploads and model-result processing. Its model endpoint points to an unavailable loopback address. No API keys are supplied.
- Use real native OAuth discovery, PKCE, HTTP loopback callbacks, token exchange, explicit scoped consent, tool calls, and refresh. The browser fixture sends an authenticated cookie only to Fitness browser routes; agent hosts do not receive it.
- Use pre-registered test clients in the general runner. Only `--native-cimd` uses native Pi CIMD and permits the static public metadata GET described above; `--cimd` is resolver-only.
- Close test-owned hosts and the loopback server. Remove the temporary directory on completion or failure. Each machine request has a deadline, and each runner subprocess has a 240-second limit.

The runner prints bounded JSON evidence without tokens, codes, browser cookies, workout results, raw host errors, or host logs. Callback URIs contain no authorization query parameters.

## Native interfaces

| Host | Interface | Tested MCP runtime |
| --- | --- | --- |
| Pi 1.4.0 | Installed built-in `McpServerConnection` and `signInMcpServer` with noninteractive authorization URL hooks | `2025-11-25` |
| Codex CLI 0.163.0 | `app-server` JSON-RPC: `mcpServer/oauth/login`, `mcpServer/tool/call`, and native thread MCP inventory; no `turn/start` | Default: `2025-06-18`; separate modern run with `--enable mcp_2026_07_28`: `2026-07-28` |
| Claude Code 2.1.303 | Noninteractive stream-json control API: `mcp_authenticate`, `mcp_status`, and `mcp_call`; no user messages | Explicit `MCP_SDK_GENERATION=v2`: `2026-07-28`; explicit `v1`: `2025-11-25` |

Codex uses `oauth.callback_url = "http://127.0.0.1/callback"` for the registered public client, with an OS-selected callback port. Its default legacy runtime proposes `2025-06-18`; Fitness now supports that revision, and the default-runtime workflow passes. Without a configured callback path, this Codex version creates a per-login `/callback/<random>` path, which does not match the fixed pre-registration fixture.

Pi uses the same built-in connection and OAuth code as the host, not an official MCP SDK substitute. This does not exercise a complete Pi session, codemode exposure, or extension permission events. All hosts use deterministic native machine calls, not model decisions or interactive approval screens. OAuth scope enforcement is tested; per-workout host approval behavior is not established.

## Observed result

The runner calls all seven Fitness tools. It checks read-only write denial at the HTTP `403` boundary, explicit read/write consent, atomic recording, retry, reading, bounded analysis, refresh after an expired server-side access token, browser revocation, and subsequent HTTP `401` denial. These checks passed for all five runtime rows in earlier runs on 2026-10-22. A later final-source run passed Pi and both Codex modes; Claude v1 reached its concurrent-refresh failure, while Claude v2 failed at its sequential refresh stage before revocation. The earlier successes are not a current all-host pass.

It then creates a separate grant and sends two native calls after expiring its access tokens. This check passes for Pi and modern Codex. Default Codex has passed this check, but it also failed under load with a refresh-token reuse race. Claude Code 2.1.303 fails in both v1 and v2: two refresh attempts use the same token, one returns `200`, another returns `400`, and Fitness revokes the family on reuse. Both calls lose authorization. The failing default Codex run had the same result. The runner exits nonzero for these compatibility failures. It does not skip them or relax refresh-token reuse detection.

A representative run used these exact callback URIs:

| Host | Callback URI |
| --- | --- |
| Pi | `http://127.0.0.1:52273/callback`, `http://127.0.0.1:52298/callback`, `http://127.0.0.1:52307/callback` |
| Codex default | `http://127.0.0.1:52365/callback`, `http://127.0.0.1:52384/callback`, `http://127.0.0.1:52408/callback` |
| Codex modern | `http://127.0.0.1:52436/callback`, `http://127.0.0.1:52470/callback`, `http://127.0.0.1:52479/callback` |
| Claude v2 | `http://localhost:52516/callback` |
| Claude v1 | `http://localhost:52733/callback` |

Ports change on each run; the JSON output is the current evidence. Claude's `mcp_status` tool projection does not return the write tool's `readOnlyHint`; this is recorded as `null`, not as proof of permission behavior.

## Remaining launch gates

- Fix or update Claude's and default Codex's concurrent OAuth refresh coordination, then rerun. A host-side fix must share one refresh or reload the rotated credential before another request uses it. Do not disable server-side refresh reuse detection.
- Verify native Codex and Claude CIMD OAuth workflows. Native Pi CIMD passed in the separate mode above. The general five-runtime matrix still uses offline pre-registration fixtures.
- Verify normal host session tool exposure and human approval behavior separately. No external model or interactive host workflow was run here.

Until these gates have an accepted disposition, this evidence is not a claim that the full launch checklist has passed.
