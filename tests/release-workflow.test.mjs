import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const workflow = read(".github/workflows/release.yml");
const ci = read(".github/workflows/ci.yml");

test("release workflow uses the official action on main pushes without a custom CI gate", () => {
  assert.match(workflow, /on:\n {2}push:\n {4}branches: \[main\]/);
  assert.match(workflow, /uses: changesets\/action@[a-f0-9]{40}/);
  assert.doesNotMatch(
    workflow,
    /workflow_run:|workflow_dispatch:|pull_request_target:|needs:|if:|gh api|GITHUB_SHA|TESTED_SHA/,
  );
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /permissions:\n {2}contents: read/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /package-manager-cache: false/);
  assert.match(workflow, /run: npm ci/);
  assert.equal([...workflow.matchAll(/uses:/g)].length, 3);
  assert.equal([...workflow.matchAll(/uses: [\w/-]+@[a-f0-9]{40}/g)].length, 3);
});

test("version-only settings use PAT_TOKEN and exclude publishing", () => {
  assert.match(workflow, /github-token: \$\{\{ secrets.PAT_TOKEN \}\}/);
  assert.doesNotMatch(
    workflow,
    /create-github-app-token|app-token|APP_CLIENT_ID|APP_PRIVATE_KEY|secrets\.GITHUB_TOKEN/,
  );
  assert.match(workflow, /version-script: npm run version-packages/);
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

test("normal PR status keeps its base and only verified version PRs use HEAD", () => {
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
