import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import test from "node:test";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const workflow = read(".github/workflows/release.yml");
const ci = read(".github/workflows/ci.yml");

function runBlock(name) {
  const start = workflow.indexOf(`      - name: ${name}\n`);
  assert.notEqual(start, -1);
  const end = workflow.indexOf("\n      - name:", start + 1);
  const block = workflow.slice(start, end === -1 ? undefined : end);
  const script = block.match(/ {8}run: \|\n([\s\S]*)$/)?.[1];
  assert.ok(script);
  return script
    .split("\n")
    .map((line) => line.replace(/^ {10}/, ""))
    .join("\n");
}

function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), "fitness-release-guard-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const output = join(cwd, "output");
  writeFileSync(
    join(cwd, "git"),
    `#!${process.execPath}
if (process.argv.slice(2).join(" ") !== "rev-parse HEAD") process.exit(2);
console.log(process.env.LOCAL_HEAD_SHA);
`,
    { mode: 0o755 },
  );
  writeFileSync(
    join(cwd, "gh"),
    `#!${process.execPath}
if (JSON.stringify(process.argv.slice(2)) !== JSON.stringify(["api", "repos/example/fitness/git/ref/heads/main", "--jq", ".object.sha"])) process.exit(2);
if (process.env.GH_FAIL) process.exit(1);
console.log(process.env.REMOTE_HEAD_SHA);
`,
    { mode: 0o755 },
  );
  return (name, variables) => {
    writeFileSync(output, "");
    const result = spawnSync(
      "bash",
      ["-euo", "pipefail", "-c", runBlock(name)],
      {
        cwd,
        env: {
          ...process.env,
          PATH: `${cwd}${delimiter}${process.env.PATH}`,
          GITHUB_OUTPUT: output,
          GITHUB_REPOSITORY: "example/fitness",
          TESTED_SHA: "a".repeat(40),
          GITHUB_SHA: "a".repeat(40),
          LOCAL_HEAD_SHA: "a".repeat(40),
          REMOTE_HEAD_SHA: "a".repeat(40),
          GH_FAIL: "",
          ...variables,
        },
        encoding: "utf8",
      },
    );
    return { ...result, outputs: readFileSync(output, "utf8") };
  };
}

test("release workflow accepts only successful same-repository main push CI", () => {
  assert.match(
    workflow,
    /workflow_run:\n {4}workflows: \[CI\]\n {4}types: \[completed\]\n {4}branches: \[main\]/,
  );
  for (const condition of [
    "github.event.workflow_run.conclusion == 'success'",
    "github.event.workflow_run.event == 'push'",
    "github.event.workflow_run.head_branch == 'main'",
    "github.event.workflow_run.head_repository.full_name == github.repository",
  ])
    assert.ok(workflow.includes(condition));
  assert.doesNotMatch(workflow, /workflow_dispatch:|pull_request_target:/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /permissions: \{\}/);
  assert.match(workflow, /permissions:\n {6}contents: read/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /package-manager-cache: false/);
  assert.equal([...workflow.matchAll(/uses:/g)].length, 4);
  assert.equal([...workflow.matchAll(/uses: [\w/-]+@[a-f0-9]{40}/g)].length, 4);
});

test("version-only settings use the App token and exclude every publish path", () => {
  assert.match(workflow, /permission-contents: write/);
  assert.match(workflow, /permission-pull-requests: write/);
  assert.match(
    workflow,
    /repositories: \$\{\{ github.event.repository.name \}\}/,
  );
  assert.match(
    workflow,
    /github-token: \$\{\{ steps.app-token.outputs.token \}\}/,
  );
  assert.match(workflow, /version-script: npm run version-packages/);
  assert.match(workflow, /pr-base-branch: main/);
  assert.match(
    workflow,
    /commit-message: "chore\(release\): version packages"/,
  );
  assert.match(workflow, /pr-title: "chore\(release\): version packages"/);
  assert.match(workflow, /create-github-releases: false/);
  assert.match(workflow, /push-git-tags: false/);
  assert.doesNotMatch(
    workflow,
    /publish-script:|id-token:|NPM_TOKEN|NODE_AUTH_TOKEN|registry-url:|changeset publish|gh release|git (?:tag|push)|compose/,
  );
  assert.equal(
    JSON.parse(read("package.json")).scripts["version-packages"],
    "changeset version && npm install --package-lock-only --ignore-scripts",
  );
  const config = JSON.parse(read(".changeset/config.json"));
  assert.deepEqual(config.privatePackages, { version: true, tag: false });
  assert.deepEqual(config.fixed, []);
  assert.deepEqual(config.linked, []);
  for (const path of [
    "apps/api",
    "apps/web",
    "packages/core",
    "packages/contracts",
  ])
    assert.equal(JSON.parse(read(`${path}/package.json`)).private, true);
});

test("all write steps require the latest-main guard; normal PR status still uses its base", () => {
  for (const name of [
    "Create repository-scoped GitHub App token",
    "Create or update version-only PR",
  ])
    assert.ok(
      workflow.includes(
        `- name: ${name}\n        if: steps.current-main.outputs.current == 'true'`,
      ),
    );
  assert.ok(ci.includes("npm run check:changesets -- --base origin/main"));
  assert.ok(
    ci.includes(
      "steps.changesets.outputs.version-pr == 'true' && 'HEAD' || 'origin/main'",
    ),
  );
  assert.ok(
    ci.includes('npm run changeset -- status --since="$CHANGESET_BASE"'),
  );
});

test("tested-revision guard accepts the checked-out CI revision", (t) => {
  const result = fixture(t)("Check tested revision");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.outputs, "current=true\n");
});

test("tested-revision guard skips a newer main checkout", (t) => {
  const result = fixture(t)("Check tested revision", {
    LOCAL_HEAD_SHA: "b".repeat(40),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.outputs, "current=false\n");
});

test("tested-revision guard rejects a different workflow context SHA", (t) => {
  const result = fixture(t)("Check tested revision", {
    GITHUB_SHA: "b".repeat(40),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.outputs, "current=false\n");
});

test("late guard accepts main only when it still matches successful CI", (t) => {
  const result = fixture(t)("Recheck latest main before writing");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.outputs, "current=true\n");
});

test("late guard skips main that advances during dependency setup", (t) => {
  const result = fixture(t)("Recheck latest main before writing", {
    REMOTE_HEAD_SHA: "b".repeat(40),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.outputs, "current=false\n");
});

test("late guard fails closed when GitHub cannot verify main", (t) => {
  const result = fixture(t)("Recheck latest main before writing", {
    GH_FAIL: "1",
  });
  assert.notEqual(result.status, 0);
  assert.equal(result.outputs, "");
});
