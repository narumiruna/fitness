import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(
  new URL("../scripts/check-changesets.mjs", import.meta.url),
);
const env = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Changesets Test",
  GIT_AUTHOR_EMAIL: "changesets@example.invalid",
  GIT_COMMITTER_NAME: "Changesets Test",
  GIT_COMMITTER_EMAIL: "changesets@example.invalid",
};

function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), "fitness-changesets-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync("git", args, {
      cwd,
      env,
      encoding: "utf8",
      stdio: "pipe",
    }).trim();
  const write = (path, content) => {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), content);
  };
  const commit = () => {
    git("add", ".");
    git(
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--quiet",
      "-m",
      "test: fixture",
    );
  };
  const check = (...args) =>
    spawnSync(process.execPath, [script, ...args], {
      cwd,
      env,
      encoding: "utf8",
    });
  git("init", "--quiet", "--initial-branch=main");
  write(
    ".changeset/existing.md",
    '---\n"@narumitw/fitness-core": patch\n---\n\nExisting change.\n',
  );
  commit();
  git("checkout", "--quiet", "-b", "feature");
  return { cwd, git, write, commit, check };
}

test("accepts a committed package changeset against the selected base", (t) => {
  const { write, commit, check } = fixture(t);
  write(
    ".changeset/core-change.md",
    '---\n"@narumitw/fitness-core": patch\n---\n\nExtract pure rules.\n',
  );
  commit();
  const result = check("--base", "main");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Found 1 new changeset/);
});

test("accepts a committed empty changeset without a version bump", (t) => {
  const { write, commit, check } = fixture(t);
  write(".changeset/tooling-only.md", "---\n---\n");
  commit();
  const result = check();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Found 1 new changeset/);
});

test("rejects a PR without a changeset", (t) => {
  const { write, commit, check } = fixture(t);
  write("source.ts", "export const value = 1;\n");
  commit();
  const result = check();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /No new changeset found/);
});

test("existing changesets, README edits, and config changes do not satisfy presence", (t) => {
  const { write, commit, check } = fixture(t);
  write(".changeset/existing.md", "---\n---\n\nModified existing change.\n");
  write(".changeset/README.md", "Tooling documentation.\n");
  write(".changeset/config.json", "{}\n");
  commit();
  assert.equal(check().status, 1);
});

test("uncommitted and deleted changesets do not satisfy presence", (t) => {
  const { git, write, commit, check } = fixture(t);
  git("rm", ".changeset/existing.md");
  commit();
  write(".changeset/untracked.md", "---\n---\n");
  assert.equal(check().status, 1);
  git("add", ".changeset/untracked.md");
  assert.equal(check().status, 1);
});

test("uses the merge base when the base branch has advanced", (t) => {
  const { git, write, commit, check } = fixture(t);
  write(".changeset/feature.md", "---\n---\n");
  commit();
  git("checkout", "--quiet", "main");
  write(".changeset/base-only.md", "---\n---\n");
  commit();
  git("checkout", "--quiet", "feature");
  const result = check();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Found 1 new changeset/);
});

test("base-only changesets do not satisfy presence for the feature branch", (t) => {
  const { git, write, commit, check } = fixture(t);
  write("source.ts", "export const value = 1;\n");
  commit();
  git("checkout", "--quiet", "main");
  write(".changeset/base-only.md", "---\n---\n");
  commit();
  git("checkout", "--quiet", "feature");
  assert.equal(check().status, 1);
});

test("fails closed for unavailable Git history and invalid arguments", (t) => {
  const { check } = fixture(t);
  for (const args of [
    ["--base", "missing-branch"],
    ["--base"],
    ["--unknown"],
    ["--base", "--help"],
  ]) {
    const result = check(...args);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.length > 0);
  }
});
