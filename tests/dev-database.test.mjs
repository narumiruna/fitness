import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import bcrypt from "bcryptjs";
import pg from "pg";
import { startPostgres } from "./postgres.mjs";

const repository = process.cwd();
let postgres;
before(async () => {
  postgres = await startPostgres();
});
after(async () => {
  await postgres?.stop();
});

async function workspace() {
  const directory = mkdtempSync(join(tmpdir(), "fitness-db-init-"));
  for (const file of ["package.json", "prisma.config.ts"]) {
    copyFileSync(join(repository, file), join(directory, file));
  }
  symlinkSync(
    join(repository, "node_modules"),
    join(directory, "node_modules"),
    "dir",
  );
  mkdirSync(join(directory, "prisma"));
  copyFileSync(
    join(repository, "prisma/schema.prisma"),
    join(directory, "prisma/schema.prisma"),
  );
  cpSync(
    join(repository, "prisma/migrations"),
    join(directory, "prisma/migrations"),
    { recursive: true },
  );
  const name = `fitness_test_${randomUUID().replaceAll("-", "")}`;
  await postgres.pool.query(`CREATE DATABASE "${name}"`);
  const url = new URL(postgres.url);
  url.pathname = `/${name}`;
  const pool = new pg.Pool({ connectionString: url.toString() });
  return {
    directory,
    url: url.toString(),
    pool,
    async close() {
      await pool.end();
      await postgres.pool.query(`DROP DATABASE "${name}"`);
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

function run(directory, databaseUrl, args = ["run", "predev"]) {
  const env = { ...process.env };
  delete env.DATABASE_URL;
  if (databaseUrl !== undefined) env.DATABASE_URL = databaseUrl;
  return spawnSync("npm", args, {
    cwd: directory,
    env,
    encoding: "utf8",
    timeout: 60_000,
  });
}

async function initialized(pool) {
  for (const table of ["User", "Exercise"]) {
    const result = await pool.query(
      `SELECT count(*)::int AS count FROM "${table}"`,
    );
    assert.equal(result.rows[0].count, 0);
  }
  const result = await pool.query(
    'SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL',
  );
  assert.equal(result.rows[0].count, 1);
}

for (const source of ["environment", ".env"]) {
  test(`predev initializes an empty PostgreSQL database from ${source} and preserves records`, async () => {
    const workspaceData = await workspace();
    const { directory, url, pool } = workspaceData;
    try {
      if (source === ".env")
        writeFileSync(join(directory, ".env"), `DATABASE_URL="${url}"\n`);
      const configuredUrl = source === ".env" ? undefined : url;
      const first = run(directory, configuredUrl);
      assert.equal(first.status, 0, first.stdout + first.stderr);
      await initialized(pool);
      const hash = bcrypt.hashSync("existing-password", 12);
      await pool.query(
        'INSERT INTO "User" (id, username, "passwordHash", role, "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)',
        ["existing-user", "existing-user", hash, "ADMIN"],
      );
      await pool.query(
        'INSERT INTO "Workout" (id, "userId", date, title, "updatedAt") VALUES ($1, $2, CURRENT_TIMESTAMP, $3, CURRENT_TIMESTAMP)',
        ["existing-workout", "existing-user", "Existing workout"],
      );
      for (let i = 0; i < 2; i++) {
        const result = run(directory, configuredUrl);
        assert.equal(result.status, 0, result.stdout + result.stderr);
      }
      assert.deepEqual(
        (await pool.query('SELECT username, "passwordHash", role FROM "User"'))
          .rows,
        [{ username: "existing-user", passwordHash: hash, role: "ADMIN" }],
      );
      assert.deepEqual((await pool.query('SELECT title FROM "Workout"')).rows, [
        { title: "Existing workout" },
      ]);
    } finally {
      await workspaceData.close();
    }
  });
}

test("npm run dev stops before Next.js when a PostgreSQL migration fails", async () => {
  const workspaceData = await workspace();
  try {
    const { directory, url } = workspaceData;
    mkdirSync(join(directory, "prisma/migrations/99999999999999_invalid"));
    writeFileSync(
      join(directory, "prisma/migrations/99999999999999_invalid/migration.sql"),
      "INVALID SQL;",
    );
    const result = run(directory, url, ["run", "dev", "--", "--help"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /prisma migrate deploy/);
    assert.doesNotMatch(result.stdout, /^> next dev/m);
  } finally {
    await workspaceData.close();
  }
});
