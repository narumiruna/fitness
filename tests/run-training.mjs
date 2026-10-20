import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import pg from "pg";
import { startPostgres } from "./postgres.mjs";

const controller = new AbortController();
let container;
let child;
let directory;
const stop = (signal) => {
  process.exitCode = signal === "SIGINT" ? 130 : 143;
  controller.abort();
  child?.kill("SIGTERM");
};
const interrupt = () => stop("SIGINT");
const terminate = () => stop("SIGTERM");
process.on("SIGINT", interrupt);
process.on("SIGTERM", terminate);
const exec = (command, args, env = process.env) => {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 120000,
    env,
  });
  if (result.status !== 0)
    throw new Error(result.stderr || result.stdout || result.error?.message);
  return result.stdout;
};
try {
  directory = await mkdtemp(join(tmpdir(), "fitness-training-"));
  const production = process.argv.includes("--postgres");
  const initial = await readFile(
    "prisma/migrations/20261011062225_init_postgresql/migration.sql",
    "utf8",
  );
  const migration = await readFile(
    "prisma/migrations/20261011120000_training_roadmap/migration.sql",
    "utf8",
  );
  const actualsMigration = await readFile(
    "prisma/migrations/20261011161830_session_actuals_entered/migration.sql",
    "utf8",
  );
  const actualsFixture = `INSERT INTO "Workout" (id,"userId",date,state,"updatedAt") VALUES ('saved-zero-workout','legacy-user',${production ? "'2026-10-10 00:00:00'" : "1791590400000"},'ACTIVE',CURRENT_TIMESTAMP);
INSERT INTO "WorkoutSet" (id,"workoutId","exerciseId","order",weight,reps,completed) VALUES ('saved-zero-set','saved-zero-workout','legacy-exercise',1,0,1,false);`;
  let databaseUrl;
  const fixture = `INSERT INTO "User" (id,username,"passwordHash","updatedAt") VALUES ('legacy-user','legacy','hash',CURRENT_TIMESTAMP); INSERT INTO "Exercise" (id,slug,"defaultName","updatedAt") VALUES ('legacy-exercise','legacy','Legacy',CURRENT_TIMESTAMP); INSERT INTO "Workout" (id,"userId",date,"updatedAt") VALUES ('legacy-workout','legacy-user',${production ? "'2026-10-10 00:00:00'" : "1791590400000"},CURRENT_TIMESTAMP); INSERT INTO "WorkoutSet" (id,"workoutId","exerciseId","order",weight,reps) VALUES ('legacy-set','legacy-workout','legacy-exercise',1,42.5,7);
INSERT INTO "ExerciseAlias" (id,"exerciseId",locale,alias,"normalizedAlias") VALUES ('legacy-alias','legacy-exercise','en','Legacy alias','legacy alias');
INSERT INTO "WorkoutTemplate" (id,"userId",title,"updatedAt") VALUES ('legacy-template','legacy-user','Legacy routine',CURRENT_TIMESTAMP);
INSERT INTO "WorkoutTemplateSet" (id,"templateId","exerciseId","order",weight,reps) VALUES ('legacy-template-set','legacy-template','legacy-exercise',1,42.5,7);`;
  if (production) {
    container = await startPostgres({ signal: controller.signal });
    databaseUrl = container.url;
    await container.pool.query(initial);
    await container.pool.query(fixture);
    const backup = exec("docker", [
      "exec",
      container.name,
      "pg_dump",
      "-U",
      "fitness",
      "--no-owner",
      "--no-acl",
      "--inserts",
      "fitness",
    ]);
    await container.pool.query(migration);
    await container.pool.query(actualsFixture);
    await container.pool.query(actualsMigration);
    await container.pool.query("CREATE DATABASE recovery");
    const restore = new pg.Pool({
      connectionString: databaseUrl.replace(/\/fitness$/, "/recovery"),
    });
    try {
      await restore.query(backup.replace(/^\\.*$/gm, ""));
      const r = await restore.query(
        "SELECT weight,reps FROM public.\"WorkoutSet\" WHERE id='legacy-set'",
      );
      if (r.rows[0].weight !== 42.5 || r.rows[0].reps !== 7)
        throw new Error("Restore failed.");
      const template = await restore.query(
        "SELECT weight,reps FROM public.\"WorkoutTemplateSet\" WHERE id='legacy-template-set'",
      );
      if (template.rows[0].weight !== 42.5 || template.rows[0].reps !== 7)
        throw new Error("Template restore failed.");
    } finally {
      await restore.end();
    }
    const empty = new pg.Pool({
      connectionString: databaseUrl.replace(/\/fitness$/, "/empty"),
    });
    await container.pool.query("CREATE DATABASE empty");
    try {
      await empty.query(initial);
      await empty.query(migration);
      await empty.query(actualsMigration);
    } finally {
      await empty.end();
    }
  } else {
    const legacy = (
      await readFile("tests/fixtures/legacy-training.prisma", "utf8")
    ).replace('provider = "postgresql"', 'provider = "sqlite"');
    const oldSchema = join(directory, "legacy.prisma");
    await writeFile(oldSchema, legacy);
    const sql = exec(process.execPath, [
      "node_modules/prisma/build/index.js",
      "migrate",
      "diff",
      "--from-empty",
      "--to-schema",
      oldSchema,
      "--script",
    ]);
    const currentSchema = "prisma/.dev/schema.prisma";
    const roadmapSchema = join(directory, "roadmap.prisma");
    await writeFile(
      roadmapSchema,
      (await readFile(currentSchema, "utf8")).replace(
        /^\s+actualsEntered\s+Boolean[^\n]*\n/m,
        "",
      ),
    );
    const roadmapUpgrade = exec(process.execPath, [
      "node_modules/prisma/build/index.js",
      "migrate",
      "diff",
      "--from-schema",
      oldSchema,
      "--to-schema",
      roadmapSchema,
      "--script",
    ]);
    const upgrade = exec(process.execPath, [
      "node_modules/prisma/build/index.js",
      "migrate",
      "diff",
      "--from-schema",
      roadmapSchema,
      "--to-schema",
      currentSchema,
      "--script",
    ]);
    const file = join(directory, "test.db");
    databaseUrl = `file:${file}`;
    const db = new Database(file);
    try {
      db.exec(sql);
      db.exec(fixture);
      await db.backup(join(directory, "backup.db"));
      db.exec(roadmapUpgrade);
      db.exec(actualsFixture);
      db.exec(upgrade);
      const restored = new Database(join(directory, "backup.db"));
      try {
        const r = restored
          .prepare('SELECT weight,reps FROM "WorkoutSet" WHERE id=?')
          .get("legacy-set");
        if (r.weight !== 42.5 || r.reps !== 7)
          throw new Error("Restore failed.");
        const template = restored
          .prepare('SELECT weight,reps FROM "WorkoutTemplateSet" WHERE id=?')
          .get("legacy-template-set");
        if (template.weight !== 42.5 || template.reps !== 7)
          throw new Error("Template restore failed.");
      } finally {
        restored.close();
      }
      const empty = new Database(join(directory, "empty.db"));
      try {
        empty.exec(sql);
        empty.exec(roadmapUpgrade);
        empty.exec(upgrade);
      } finally {
        empty.close();
      }
    } finally {
      db.close();
    }
  }
  console.log(
    `Legacy upgrade, empty upgrade, and backup restoration passed (${production ? "PostgreSQL" : "SQLite"}).`,
  );
  controller.signal.throwIfAborted();
  child = spawn(
    process.execPath,
    ["--import", "tsx", "--test", "tests/training-integration.test.ts"],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_ENV: production ? "production" : "development",
        DATABASE_URL: databaseUrl,
      },
    },
  );
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
  if (!controller.signal.aborted) process.exitCode = code;
} catch (error) {
  if (!controller.signal.aborted) throw error;
} finally {
  try {
    await container?.stop();
    if (directory) await rm(directory, { recursive: true, force: true });
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", terminate);
  }
}
