import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const children = new Set();
let stopping = false;
let stopPromise;

function groupExists(child) {
  if (!child.pid) return false;
  if (process.platform === "win32")
    return child.exitCode === null && child.signalCode === null;
  try {
    process.kill(-child.pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    throw error;
  }
}

function launch(command, args, persistent = false) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: "inherit",
    detached: process.platform !== "win32",
    env: { ...process.env, NODE_ENV: "development" },
  });
  children.add(child);
  child.once("error", (error) => {
    console.error(error);
    void stop(1);
  });
  child.once("exit", (code) => {
    // Keep ownership after the group leader exits: its descendants can survive.
    if (!groupExists(child)) children.delete(child);
    if (!stopping && persistent) void stop(code || 1);
  });
  return child;
}

function signal(child, value) {
  if (!child.pid) return;
  try {
    if (process.platform === "win32") child.kill(value);
    else process.kill(-child.pid, value);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}

function stop(code) {
  if (stopPromise) return stopPromise;
  stopping = true;
  process.exitCode = code;
  stopPromise = (async () => {
    const owned = [...children];
    const exits = owned.map((child) =>
      child.exitCode !== null || child.signalCode !== null
        ? Promise.resolve()
        : once(child, "exit").catch(() => {}),
    );
    for (const child of owned) signal(child, "SIGTERM");
    const deadline = Date.now() + 3000;
    while (owned.some(groupExists) && Date.now() < deadline) await delay(25);
    // Do not cancel escalation merely because npm exited before its workers.
    for (const child of owned) {
      if (groupExists(child)) signal(child, "SIGKILL");
    }
    await Promise.all(exits);
  })();
  return stopPromise;
}

async function reserve(port) {
  // Readiness probes must not keep this temporary reservation open during close.
  const server = createServer((socket) => socket.destroy());
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  return server;
}

// npm and a process-group signal can both deliver the same shutdown signal.
// Keep handlers installed until cleanup finishes; a second signal must not orphan workers.
process.on("SIGINT", () => void stop(130));
process.on("SIGTERM", () => void stop(143));

const reservations = [];
try {
  for (const port of [8784, 8785]) reservations.push(await reserve(port));
  const build = launch("npm", ["run", "build:packages"]);
  const [code] = await once(build, "exit");
  if (stopping) await stopPromise;
  else if (code !== 0) throw new Error("Shared package build failed.");
  for (const server of reservations) {
    await new Promise((resolve) => server.close(resolve));
  }
  reservations.length = 0;
  if (!stopping) {
    for (const workspace of ["core", "contracts", "api", "web"]) {
      launch(
        "npm",
        ["run", "dev", "--workspace", `@narumitw/fitness-${workspace}`],
        true,
      );
    }
  }
} catch (error) {
  console.error(error);
  await stop(1);
} finally {
  for (const server of reservations) server.close();
}
