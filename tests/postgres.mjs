import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import pg from "pg";

function docker(args) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    timeout: 120_000,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.error?.message || "Docker failed.");
  }
  return result.stdout.trim();
}

// Each test run owns its container. Never connect to a developer's database.
export async function startPostgres({ signal } = {}) {
  signal?.throwIfAborted();
  const name = `fitness-test-${randomUUID()}`;
  docker([
    "run",
    "--detach",
    "--rm",
    "--name",
    name,
    "--publish",
    "127.0.0.1::5432",
    "--env",
    "POSTGRES_USER=fitness",
    "--env",
    "POSTGRES_PASSWORD=fitness",
    "--env",
    "POSTGRES_DB=fitness",
    "postgres:17-bookworm",
  ]);
  let pool;
  try {
    const port = docker(["port", name, "5432/tcp"]).split(":").at(-1);
    const url = `postgresql://fitness:fitness@127.0.0.1:${port}/fitness`;
    pool = new pg.Pool({
      connectionString: url,
      connectionTimeoutMillis: 1000,
    });
    for (let attempt = 0; ; attempt++) {
      signal?.throwIfAborted();
      try {
        await pool.query("SELECT 1");
        break;
      } catch (error) {
        if (attempt === 59) throw error;
        await setTimeout(500, undefined, { signal });
      }
    }
    signal?.throwIfAborted();
    return {
      url,
      pool,
      async stop() {
        try {
          await pool.end();
        } finally {
          docker(["rm", "--force", name]);
        }
      },
    };
  } catch (error) {
    await pool?.end();
    docker(["rm", "--force", name]);
    throw error;
  }
}
