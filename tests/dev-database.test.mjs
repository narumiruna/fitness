import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import bcrypt from "bcryptjs";

const repository = process.cwd();

function workspace() {
  const directory = mkdtempSync(join(tmpdir(), "fitness-db-init-"));
  for (const file of [
    "package.json",
    "prisma.config.ts",
    "prisma-dev.config.ts",
    "prisma/schema.prisma",
    "scripts/generate-prisma.mjs",
    "src/lib/development-database.ts",
  ]) {
    const target = join(directory, file);
    mkdirSync(join(target, ".."), { recursive: true });
    copyFileSync(join(repository, file), target);
  }
  symlinkSync(
    join(repository, "node_modules"),
    join(directory, "node_modules"),
    "dir",
  );
  return directory;
}

function run(directory, databaseUrl, args = ["run", "predev"]) {
  const env = { ...process.env, NODE_ENV: "development" };
  delete env.DATABASE_URL;
  if (databaseUrl !== undefined) env.DATABASE_URL = databaseUrl;
  return spawnSync("npm", args, {
    cwd: directory,
    env,
    encoding: "utf8",
    timeout: 60_000,
  });
}

for (const source of ["environment", ".env.local"]) {
  test(`predev ignores production PostgreSQL URLs from ${source} and preserves SQLite data`, () => {
    const directory = workspace();
    const productionUrl =
      "postgresql://production:private@127.0.0.1:1/production";
    try {
      if (source === ".env.local")
        writeFileSync(
          join(directory, source),
          `DATABASE_URL="${productionUrl}"\n`,
        );
      const configuredUrl =
        source === "environment" ? productionUrl : undefined;
      const first = run(directory, configuredUrl);
      assert.equal(first.status, 0, first.stdout + first.stderr);
      const filename = join(directory, ".cache/dev.db");
      assert.equal(existsSync(filename), true);
      const db = new DatabaseSync(filename);
      try {
        assert.equal(
          db.prepare('SELECT count(*) AS count FROM "User"').get().count,
          0,
        );
        assert.equal(
          db.prepare('SELECT count(*) AS count FROM "Exercise"').get().count,
          0,
        );
        const hash = bcrypt.hashSync("existing-password", 12);
        db.prepare(
          'INSERT INTO "User" (id, username, "passwordHash", role, "updatedAt") VALUES (?, ?, ?, ?, ?)',
        ).run("existing-user", "existing-user", hash, "ADMIN", Date.now());
        db.prepare(
          'INSERT INTO "Workout" (id, "userId", date, title, "updatedAt") VALUES (?, ?, ?, ?, ?)',
        ).run(
          "existing-workout",
          "existing-user",
          Date.now(),
          "Existing workout",
          Date.now(),
        );
        for (let i = 0; i < 2; i++) {
          const result = run(directory, configuredUrl);
          assert.equal(result.status, 0, result.stdout + result.stderr);
        }
        assert.equal(
          db.prepare('SELECT "passwordHash" FROM "User"').get().passwordHash,
          hash,
        );
        assert.equal(
          db.prepare('SELECT title FROM "Workout"').get().title,
          "Existing workout",
        );
      } finally {
        db.close();
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

test("development accepts a SQLite file URL for isolated tests", () => {
  const directory = workspace();
  try {
    const result = run(directory, "file:./custom.db");
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(existsSync(join(directory, "custom.db")), true);
    assert.equal(existsSync(join(directory, ".cache/dev.db")), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("npm run dev stops before Next.js when schema initialization fails", () => {
  const directory = workspace();
  try {
    writeFileSync(join(directory, "prisma/schema.prisma"), "INVALID SCHEMA;");
    const result = run(directory, undefined, ["run", "dev", "--", "--help"]);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stdout, /^> NODE_ENV=development next dev/m);
    assert.equal(existsSync(join(directory, ".cache/dev.db")), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("predev refuses destructive SQLite schema changes and preserves stored values", () => {
  const directory = workspace();
  try {
    const initial = run(directory);
    assert.equal(initial.status, 0, initial.stdout + initial.stderr);
    const filename = join(directory, ".cache/dev.db");
    const db = new DatabaseSync(filename);
    try {
      db.prepare(
        'INSERT INTO "User" (id, username, "passwordHash", "updatedAt") VALUES (?, ?, ?, ?)',
      ).run("user", "user", "hash", Date.now());
      db.prepare(
        'INSERT INTO "Workout" (id, "userId", date, title, "updatedAt") VALUES (?, ?, ?, ?, ?)',
      ).run("workout", "user", Date.now(), "Keep this title", Date.now());
      const schemaPath = join(directory, "prisma/schema.prisma");
      const schema = readFileSync(schemaPath, "utf8");
      const titleField = /^\s+title\s+String\?\r?\n/m;
      assert.match(schema, titleField);
      writeFileSync(schemaPath, schema.replace(titleField, ""));
      const result = run(directory);
      assert.notEqual(result.status, 0);
      assert.equal(
        db.prepare('SELECT title FROM "Workout"').get().title,
        "Keep this title",
      );
    } finally {
      db.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("generated SQLite schema keeps the canonical models unchanged", () => {
  const sqlite = readFileSync("prisma/.dev/schema.prisma", "utf8")
    .replace('provider = "sqlite"', 'provider = "postgresql"')
    .replace(
      '"../../src/generated/prisma-sqlite"',
      '"../src/generated/prisma"',
    );
  assert.equal(sqlite, readFileSync("prisma/schema.prisma", "utf8"));
});
