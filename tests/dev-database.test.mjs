import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";

const repository = process.cwd();

function workspace() {
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
  return directory;
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

function initialized(path) {
  assert.ok(existsSync(path));
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    assert.equal(
      db.prepare("SELECT count(*) AS count FROM User").get().count,
      0,
    );
    assert.equal(
      db.prepare("SELECT count(*) AS count FROM Exercise").get().count,
      0,
    );
    assert.equal(
      db
        .prepare(
          "SELECT count(*) AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL",
        )
        .get().count,
      2,
    );
  } finally {
    db.close();
  }
}

for (const empty of [false, true]) {
  test(`predev initializes a ${empty ? "zero-byte" : "missing"} default database without seeding`, () => {
    const directory = workspace();
    try {
      const path = join(directory, "dev.db");
      if (empty) writeFileSync(path, "");
      const result = run(directory);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      initialized(path);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

for (const source of [
  "absolute environment URL",
  "relative environment URL",
  ".env",
]) {
  test(`predev honors ${source} and preserves accounts and workouts on repeated runs`, () => {
    const directory = workspace();
    try {
      const path = join(directory, "custom.db");
      const url =
        source === "absolute environment URL"
          ? `file:${path}`
          : "file:./custom.db";
      if (source === ".env")
        writeFileSync(join(directory, ".env"), `DATABASE_URL="${url}"\n`);
      const configuredUrl = source === ".env" ? undefined : url;
      const first = run(directory, configuredUrl);
      assert.equal(first.status, 0, first.stdout + first.stderr);
      initialized(path);
      assert.equal(existsSync(join(directory, "dev.db")), false);
      const hash = bcrypt.hashSync("existing-password", 12);
      const db = new Database(path);
      try {
        db.prepare(
          "INSERT INTO User (id, username, passwordHash, role, updatedAt) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)",
        ).run("existing-user", "existing-user", hash, "ADMIN");
        db.prepare(
          "INSERT INTO Workout (id, userId, date, title, updatedAt) VALUES (?, ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP)",
        ).run("existing-workout", "existing-user", "Existing workout");
      } finally {
        db.close();
      }
      for (let i = 0; i < 2; i++) {
        const result = run(directory, configuredUrl);
        assert.equal(result.status, 0, result.stdout + result.stderr);
      }
      const saved = new Database(path, { readonly: true, fileMustExist: true });
      try {
        assert.deepEqual(
          saved.prepare("SELECT username, passwordHash, role FROM User").get(),
          { username: "existing-user", passwordHash: hash, role: "ADMIN" },
        );
        assert.equal(
          saved.prepare("SELECT title FROM Workout").get().title,
          "Existing workout",
        );
        assert.equal(
          saved.prepare("SELECT count(*) AS count FROM User").get().count,
          1,
        );
      } finally {
        saved.close();
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

test("npm run dev stops before starting Next.js when migrations fail", () => {
  const directory = workspace();
  try {
    const result = run(directory, `file:${directory}`, [
      "run",
      "dev",
      "--",
      "--help",
    ]);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /prisma migrate deploy/);
    assert.doesNotMatch(result.stdout, /^> next dev/m);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
