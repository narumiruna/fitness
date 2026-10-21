import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { passkeysViewSchema, userSchema } from "@narumitw/fitness-contracts";
import { toDto, validateDto } from "../src/dto.js";
import { developmentDatabaseUrl } from "../src/lib/development-database.js";
import { loadEnvironment } from "../src/lib/environment.js";
import { validateProductionOrigin } from "../src/origin.js";

test("production requires one exact canonical HTTPS origin", () => {
  for (const value of [
    "",
    "http://example.test",
    "https://example.test/page///",
    "https://example.test/?query",
    "https://example.test/#fragment",
    "https://example.test:443/",
    "https://example.test/../",
    " https://example.test/",
    "https://example.test/ ",
    "https://example.test\\\\",
    "https://example.test.evil/path/",
    "https://user:secret@example.test",
    "https://example.test/page",
    "https://example.test?query",
    "https://example.test#fragment",
    "https://EXAMPLE.test",
    "not a URL",
  ])
    assert.throws(() => validateProductionOrigin(value), /exact HTTPS origin/);
  assert.equal(
    validateProductionOrigin("https://example.test"),
    "https://example.test",
  );
  assert.equal(
    validateProductionOrigin("https://localhost:8784"),
    "https://localhost:8784",
  );
});

test("production strips only trailing slashes from configured origins", () => {
  for (const origin of ["https://example.test", "https://localhost:8784"])
    for (const suffix of ["", "/", "///"])
      assert.equal(validateProductionOrigin(`${origin}${suffix}`), origin);
});

test("environment precedence, interpolation, test local exclusion", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "fitness-api-env-"));
  try {
    writeFileSync(
      path.join(directory, ".env"),
      "VALUE=base\nBASE=base\nSHARED=base\n",
    );
    writeFileSync(
      path.join(directory, ".env.development"),
      "VALUE=mode\nMODE=yes\n",
    );
    writeFileSync(
      path.join(directory, ".env.local"),
      "VALUE=local\nLOCAL=yes\n",
    );
    writeFileSync(
      path.join(directory, ".env.development.local"),
      // biome-ignore lint/suspicious/noTemplateCurlyInString: Fixture tests dotenv interpolation.
      "VALUE=mode-local\nEXPANDED=${EXTERNAL}/$VALUE\nESCAPED=\\$VALUE\n",
    );
    const env = { EXTERNAL: "process", SHARED: "process" };
    loadEnvironment(directory, "development", env);
    assert.deepEqual(env, {
      EXTERNAL: "process",
      SHARED: "process",
      VALUE: "mode-local",
      EXPANDED: "process/mode-local",
      ESCAPED: "$VALUE",
      LOCAL: "yes",
      MODE: "yes",
      BASE: "base",
    });
    const testEnv: NodeJS.ProcessEnv = {};
    loadEnvironment(directory, "test", testEnv);
    assert.equal(testEnv.VALUE, "base");
    assert.equal(testEnv.LOCAL, undefined);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
test("development ignores inherited PostgreSQL URLs and resolves SQLite at root", () => {
  const previous = process.env.DATABASE_URL;
  try {
    process.env.DATABASE_URL = "postgresql://not-a-development-database";
    assert.match(developmentDatabaseUrl(), /\/\.cache\/dev.db$/);
    process.env.DATABASE_URL = "file:./relative.db";
    assert.match(developmentDatabaseUrl(), /\/fitness\/relative.db$/);
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});
test("domain calendar dates never become UTC timestamps", () => {
  const date = new Date(2026, 9, 20);
  const value = toDto({
    date,
    plannedDate: date,
    effectiveFrom: date,
    effectiveTo: date,
    createdAt: date,
  });
  assert.deepEqual(value, {
    date: "2026-10-20",
    plannedDate: "2026-10-20",
    effectiveFrom: "2026-10-20",
    effectiveTo: "2026-10-20",
    createdAt: date.toISOString(),
  });
});
test("response allow-list removes secrets and rejects malformed DTOs or unsafe values", () => {
  assert.deepEqual(
    validateDto(userSchema, {
      id: "u",
      username: "name",
      role: "USER",
      passwordHash: "secret",
    }),
    { id: "u", username: "name", role: "USER" },
  );
  assert.throws(
    () => validateDto(userSchema, { id: 1, username: "name", role: "USER" }),
    /Invalid response DTO/,
  );
  assert.throws(() => toDto({ unsafe: 1n }), /Unsupported DTO value/);
  assert.throws(
    () => toDto({ unsafe: new Uint8Array([1]) }),
    /Unsupported DTO value/,
  );
  const safe = validateDto(passkeysViewSchema, {
    passkeys: [
      {
        id: "p",
        name: "key",
        createdAt: new Date("2026-10-20T12:00:00Z"),
        lastUsedAt: null,
        publicKey: new Uint8Array([1]),
        counter: 1n,
      },
    ],
  });
  assert.doesNotMatch(JSON.stringify(safe), /publicKey|counter/);
});
