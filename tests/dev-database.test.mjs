import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
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
  const directory = realpathSync(
    mkdtempSync(join(tmpdir(), "fitness-db-init-")),
  );
  for (const file of [
    "package.json",
    "prisma.config.ts",
    "prisma-dev.config.ts",
    "prisma/schema.prisma",
    "scripts/generate-prisma.mjs",
    "scripts/dev.mjs",
    "apps/api/src/lib/development-database.ts",
    "apps/api/src/lib/environment.ts",
    "apps/api/src/paths.ts",
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

test("environment files follow root precedence without replacing inherited values", () => {
  const directory = workspace();
  try {
    for (const [file, contents] of Object.entries({
      ".env": "SHARED=base\nBASE_ONLY=base\n",
      ".env.development": "SHARED=mode\nMODE_ONLY=mode\n",
      ".env.local": "SHARED=local\nLOCAL_ONLY=local\n",
      ".env.development.local": `SHARED=mode-local\nEXPANDED=\${SHARED}/suffix\nINHERITED=file\n`,
    })) {
      writeFileSync(join(directory, file), contents);
    }
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `import { loadEnvironment } from "./apps/api/src/lib/environment.ts";
       console.log(JSON.stringify(loadEnvironment(process.cwd(), "development", { INHERITED: "process" })));`,
      ],
      { cwd: directory, encoding: "utf8", timeout: 30_000 },
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      INHERITED: "process",
      SHARED: "mode-local",
      EXPANDED: "mode-local/suffix",
      LOCAL_ONLY: "local",
      MODE_ONLY: "mode",
      BASE_ONLY: "base",
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("test mode excludes .env.local but keeps mode-local and base files", () => {
  const directory = workspace();
  try {
    writeFileSync(join(directory, ".env"), "BASE_ONLY=base\n");
    writeFileSync(
      join(directory, ".env.local"),
      "LOCAL_ONLY=private\nSHARED=local\n",
    );
    writeFileSync(join(directory, ".env.test"), "SHARED=test\n");
    writeFileSync(join(directory, ".env.test.local"), "SHARED=test-local\n");
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `import { loadEnvironment } from "./apps/api/src/lib/environment.ts";
       console.log(JSON.stringify(loadEnvironment(process.cwd(), "test", {})));`,
      ],
      { cwd: directory, encoding: "utf8", timeout: 30_000 },
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      SHARED: "test-local",
      BASE_ONLY: "base",
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

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

test("SQLite paths resolve from the repository root even when called from a workspace", () => {
  const directory = workspace();
  try {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `import { developmentDatabaseUrl } from "./apps/api/src/lib/development-database.ts";
       process.chdir("apps/api");
       process.env.DATABASE_URL = "file:./custom.db";
       const custom = developmentDatabaseUrl();
       process.env.DATABASE_URL = "postgresql://production:private@127.0.0.1:1/production";
       console.log(JSON.stringify({ custom, fallback: developmentDatabaseUrl() }));`,
      ],
      { cwd: directory, encoding: "utf8", timeout: 30_000 },
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      custom: `file:${join(directory, "custom.db")}`,
      fallback: `file:${join(directory, ".cache/dev.db")}`,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("development accepts a SQLite file URL for isolated tests", () => {
  const directory = workspace();
  try {
    const result = run(directory, "file:./custom.db");
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(existsSync(join(directory, "custom.db")), true);
    assert.equal(existsSync(join(directory, ".cache/dev.db")), false);
    // This fixture has no tsconfig, as in the Docker dependency-install layer.
    for (const client of ["prisma", "prisma-sqlite"]) {
      assert.match(
        readFileSync(
          join(directory, "apps/api/src/generated", client, "client.ts"),
          "utf8",
        ),
        /from ["']\.\/internal\/class\.js["']/,
        "Generated clients must support the compiled Node runtime without tsconfig inference",
      );
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("npm run dev stops before Vite and Hono when schema initialization fails", () => {
  const directory = workspace();
  try {
    writeFileSync(join(directory, "prisma/schema.prisma"), "INVALID SCHEMA;");
    const result = run(directory, undefined, ["run", "dev", "--", "--help"]);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stdout, /^> node scripts\/dev\.mjs/m);
    assert.doesNotMatch(result.stdout + result.stderr, /Local:|API listening/);
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
      '"../../apps/api/src/generated/prisma-sqlite"',
      '"../apps/api/src/generated/prisma"',
    );
  assert.equal(sqlite, readFileSync("prisma/schema.prisma", "utf8"));
});
