import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

// No inherited credentials, CLI settings, project extensions, or existing servers.
const root = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
if (
  args.length > 1 ||
  (args.length === 1 && !["--cimd", "--native-cimd"].includes(args[0]))
) {
  console.error("Usage: node tests/mcp-clients.mjs [--cimd | --native-cimd]");
  process.exit(1);
}
const mode = args[0];
const scratch = await mkdtemp(join(tmpdir(), "fitness-mcp-clients-"));
const env = {
  PATH: process.env.PATH ?? "/usr/bin:/bin",
  HOME: scratch,
  TMPDIR: scratch,
  XDG_CONFIG_HOME: join(scratch, "config"),
  XDG_CACHE_HOME: join(scratch, "cache"),
  CODEX_HOME: join(scratch, "codex"),
  CLAUDE_CONFIG_DIR: join(scratch, "claude"),
  PI_CODING_AGENT_DIR: join(scratch, "pi"),
  NODE_ENV: "test",
  DATABASE_URL: `file:${join(scratch, "test.db")}`,
  NO_COLOR: "1",
  CI: "1",
  DISABLE_AUTOUPDATER: "1",
  DISABLE_TELEMETRY: "1",
  DISABLE_ERROR_REPORTING: "1",
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
  ANTHROPIC_BASE_URL: "http://127.0.0.1:1",
  FITNESS_MCP_CLIENTS_DIR: scratch,
};
async function prepare() {
  // The API loads repository dotenv files. Mask their key NAMES without using values.
  for (const name of [
    ".env.test.local",
    ".env.test",
    ".env.development.local",
    ".env.local",
    ".env.development",
    ".env",
  ]) {
    if (!existsSync(join(root, name))) continue;
    const source = await readFile(join(root, name), "utf8");
    for (const match of source.matchAll(
      /^\s*(?:export\s+)?([\w.-]+)\s*(?:=|:\s)/gm,
    ))
      env[match[1]] ??= "";
  }
  for (const name of ["codex", "claude", "pi", "bin"])
    await mkdir(join(scratch, name), { recursive: true });
  await copyFile(
    join(root, "tests/fixtures/mcp-no-keychain.sh"),
    join(scratch, "bin/security"),
  );
  await chmod(join(scratch, "bin/security"), 0o700);
  env.PATH = `${join(scratch, "bin")}:${env.PATH}`;
}

async function executable(name) {
  const candidates = [join(root, "node_modules/.bin", name)];
  for (const directory of env.PATH.split(":"))
    candidates.push(join(directory, name));
  for (const candidate of candidates)
    if (existsSync(candidate)) return realpath(candidate);
  throw new Error(`Required installed host not found: ${name}`);
}
let child;
let cancelled = false;
async function stop() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const group = child.pid;
  const stopped = new Promise((done) => child.once("exit", done));
  try {
    process.kill(-group, "SIGTERM");
  } catch {}
  const kill = () => {
    try {
      process.kill(-group, "SIGKILL");
    } catch {}
  };
  const timer = setTimeout(kill, 2000);
  await stopped;
  clearTimeout(timer);
  kill(); // Also stop descendants if the group leader exited first.
}
async function run(args, cwd = root, silent = false) {
  if (cancelled) throw new Error("MCP compatibility run cancelled");
  child = spawn(process.execPath, args, {
    cwd,
    env,
    stdio: silent ? "pipe" : "inherit",
    detached: true,
  });
  if (silent) {
    child.stdin.end();
    child.stdout.resume();
    child.stderr.resume();
  }
  const timer = setTimeout(() => void stop(), 240_000);
  try {
    const code = await new Promise((done, reject) => {
      child.once("error", reject);
      child.once("exit", done);
    });
    if (code !== 0) throw new Error("MCP compatibility subprocess failed");
  } finally {
    clearTimeout(timer);
  }
}
const interrupt = () => {
  cancelled = true;
  process.exitCode = 130;
  void stop();
};
const terminate = () => {
  cancelled = true;
  process.exitCode = 143;
  void stop();
};
process.on("SIGINT", interrupt);
process.on("SIGTERM", terminate);
try {
  await prepare();
  const cimd = mode === "--cimd";
  if (!cimd) {
    env.FITNESS_MCP_PI_ROOT = resolve(dirname(await executable("pi")), "../..");
    if (mode !== "--native-cimd") {
      env.FITNESS_MCP_CODEX = await executable("codex");
      env.FITNESS_MCP_CLAUDE = await executable("claude");
    }
  }
  await run(
    [
      "node_modules/prisma/build/index.js",
      "db",
      "push",
      "--config",
      "prisma-dev.config.ts",
    ],
    root,
    true,
  );
  await run(
    [
      "--import",
      join(root, "node_modules/tsx/dist/loader.mjs"),
      join(
        root,
        cimd
          ? "tests/fixtures/mcp-cimd-probe.mjs"
          : "tests/fixtures/mcp-hosts.mjs",
      ),
      ...(mode === "--native-cimd" ? [mode] : []),
    ],
    scratch,
  );
} catch (error) {
  console.error(error.message);
  process.exitCode ||= 1;
} finally {
  await stop();
  process.off("SIGINT", interrupt);
  process.off("SIGTERM", terminate);
  await rm(scratch, { recursive: true, force: true });
}
