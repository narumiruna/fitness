import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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
  GITHUB_EVENT_NAME: "",
  GITHUB_EVENT_PATH: "",
  GITHUB_REPOSITORY: "",
  GITHUB_OUTPUT: "",
  GIT_AUTHOR_NAME: "Changesets Test",
  GIT_AUTHOR_EMAIL: "changesets@example.invalid",
  GIT_COMMITTER_NAME: "Changesets Test",
  GIT_COMMITTER_EMAIL: "changesets@example.invalid",
};

function fixture(
  t,
  changesetContent = '---\n"@narumitw/fitness-core": patch\n---\n\nExisting change.\n',
) {
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
  const eventPath = join(cwd, ".git", "event.json");
  const outputPath = join(cwd, ".git", "output");
  const checkEvent = (event, variables = {}) => {
    writeFileSync(eventPath, JSON.stringify(event));
    writeFileSync(outputPath, "");
    return spawnSync(process.execPath, [script, "--base", "main"], {
      cwd,
      env: {
        ...env,
        GITHUB_EVENT_NAME: "pull_request",
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_REPOSITORY: "example/fitness",
        GITHUB_OUTPUT: outputPath,
        ...variables,
      },
      encoding: "utf8",
    });
  };
  git("init", "--quiet", "--initial-branch=main");
  write(
    "package.json",
    '{"name":"fitness","private":true,"version":"1.0.0"}\n',
  );
  write("package-lock.json", '{"version":"1.0.0"}\n');
  write(
    "packages/core/package.json",
    '{"name":"@narumitw/fitness-core","private":true,"version":"1.0.0"}\n',
  );
  write(".changeset/existing.md", changesetContent);
  commit();
  git("checkout", "--quiet", "-b", "feature");
  return {
    cwd,
    git,
    write,
    commit,
    check,
    checkEvent,
    output: () => readFileSync(outputPath, "utf8"),
  };
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

function versionEvent() {
  return {
    pull_request: {
      user: { type: "Bot" },
      title: "chore(release): version packages",
      head: {
        ref: "changeset-release/main",
        repo: { full_name: "example/fitness" },
      },
      base: { ref: "main", repo: { full_name: "example/fitness" } },
    },
  };
}

function versionFixture(t) {
  const f = fixture(t);
  f.git("rm", ".changeset/existing.md");
  f.write(
    "packages/core/package.json",
    '{"name":"@narumitw/fitness-core","private":true,"version":"1.0.1"}\n',
  );
  f.write("packages/core/CHANGELOG.md", "# 1.0.1\n\nVersioned change.\n");
  f.write("package-lock.json", '{"version":"1.0.0","packages":{}}\n');
  return f;
}

test("accepts only the generated version PR shape and reports its status base", (t) => {
  const f = versionFixture(t);
  f.commit();
  assert.equal(f.check().status, 1, "Local/manual PRs still need a changeset");
  const result = f.checkEvent(versionEvent());
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Verified generated version PR/);
  assert.equal(f.output(), "version-pr=true\n");
});

test("ordinary new changesets do not select the version-PR exception", async (t) => {
  for (const content of [
    "---\n---\n",
    '---\n"@narumitw/fitness-core": patch\n---\n\nChange.\n',
  ]) {
    await t.test(
      content.includes("fitness-core") ? "package" : "empty",
      (t) => {
        const f = fixture(t);
        f.write(".changeset/new.md", content);
        f.commit();
        const result = f.checkEvent(versionEvent());
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /Found 1 new changeset/);
        assert.equal(f.output(), "version-pr=false\n");
      },
    );
  }
});

test("rejects human, fork, wrong-branch/title/base and non-PR lookalikes", (t) => {
  const f = versionFixture(t);
  f.commit();
  const modifications = [
    (pr) => {
      pr.user.type = "User";
    },
    (pr) => {
      pr.head.repo.full_name = "fork/fitness";
    },
    (pr) => {
      pr.base.repo.full_name = "other/fitness";
    },
    (pr) => {
      pr.head.ref = "changeset-release/other";
    },
    (pr) => {
      pr.base.ref = "other";
    },
    (pr) => {
      pr.title = "Version Packages";
    },
  ];
  for (const modify of modifications) {
    const event = versionEvent();
    modify(event.pull_request);
    assert.equal(f.checkEvent(event).status, 1);
    assert.equal(f.output(), "");
  }
  assert.equal(f.checkEvent({}).status, 1);
  assert.equal(
    f.checkEvent(versionEvent(), { GITHUB_EVENT_NAME: "push" }).status,
    1,
  );
  assert.equal(
    f.checkEvent(versionEvent(), { GITHUB_REPOSITORY: "" }).status,
    1,
  );
});

test("rejects generated-PR lookalikes with source, workflow, config or unexpected file changes", async (t) => {
  for (const path of [
    "apps/web/src/app.tsx",
    ".github/workflows/ci.yml",
    ".changeset/config.json",
    ".changeset/README.md",
    "packages/other/CHANGELOG.md",
    "unexpected.md",
  ]) {
    await t.test(path, (t) => {
      const f = versionFixture(t);
      f.write(path, "Unexpected content.\n");
      f.commit();
      assert.equal(f.checkEvent(versionEvent()).status, 1);
    });
  }
});

test("rejects metadata-only lookalikes that did not consume changesets", (t) => {
  const f = fixture(t);
  f.write("packages/core/CHANGELOG.md", "# 1.0.1\n");
  f.commit();
  assert.equal(f.checkEvent(versionEvent()).status, 1);
});

test("allows consumption of empty changesets without a package version bump", (t) => {
  const f = fixture(t, "---\n---\n");
  f.git("rm", ".changeset/existing.md");
  f.commit();
  assert.equal(f.checkEvent(versionEvent()).status, 0);
});
