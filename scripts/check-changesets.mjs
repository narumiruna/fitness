import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: "pipe" }).trim();
}

function isChangeset(path) {
  return (
    /^\.changeset\/[^/]+\.md$/.test(path) && path !== ".changeset/README.md"
  );
}

function isGeneratedVersionPr(mergeBase) {
  const { GITHUB_EVENT_NAME, GITHUB_EVENT_PATH, GITHUB_REPOSITORY } =
    process.env;
  if (
    GITHUB_EVENT_NAME !== "pull_request" ||
    !GITHUB_EVENT_PATH ||
    !GITHUB_REPOSITORY
  )
    return false;
  const { pull_request: pr } = JSON.parse(
    readFileSync(GITHUB_EVENT_PATH, "utf8"),
  );
  if (
    pr?.user?.type !== "Bot" ||
    pr.title !== "chore(release): version packages" ||
    pr.head?.ref !== "changeset-release/main" ||
    pr.base?.ref !== "main" ||
    pr.head?.repo?.full_name !== GITHUB_REPOSITORY ||
    pr.base?.repo?.full_name !== GITHUB_REPOSITORY
  )
    return false;

  const fields = git(
    "diff",
    "--name-status",
    "--no-renames",
    "-z",
    mergeBase,
    "HEAD",
  ).split("\0");
  let consumed = false;
  for (let index = 0; index < fields.length - 1; index += 2) {
    const [status, path] = fields.slice(index, index + 2);
    if (isChangeset(path) && status === "D") {
      consumed = true;
      continue;
    }
    if (
      status === "M" &&
      (path === "package.json" ||
        path === "package-lock.json" ||
        /^(apps\/(api|web)|packages\/(core|contracts))\/package\.json$/.test(
          path,
        ))
    )
      continue;
    if (
      (status === "A" || status === "M") &&
      /^(apps\/(api|web)|packages\/(core|contracts))\/CHANGELOG\.md$/.test(path)
    )
      continue;
    return false;
  }
  return consumed;
}

try {
  const args = process.argv.slice(2);
  if (
    args.length !== 0 &&
    (args.length !== 2 || args[0] !== "--base" || !args[1])
  ) {
    throw new Error("Usage: node scripts/check-changesets.mjs [--base <ref>]");
  }
  const base = args[1] ?? "main";
  const baseCommit = git(
    "rev-parse",
    "--verify",
    "--end-of-options",
    `${base}^{commit}`,
  );
  const mergeBase = git("merge-base", baseCommit, "HEAD");
  const paths = git(
    "diff",
    "--name-only",
    "--no-renames",
    "--diff-filter=A",
    "-z",
    mergeBase,
    "HEAD",
    "--",
    ".changeset/",
  ).split("\0");
  const changesets = paths.filter(isChangeset);
  const versionPr = changesets.length === 0 && isGeneratedVersionPr(mergeBase);
  if (changesets.length === 0 && !versionPr) {
    throw new Error(
      `No new changeset found against ${base}. Add a package changeset or an empty changeset for tooling/docs-only work.`,
    );
  }
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `version-pr=${versionPr}\n`);
  console.log(
    versionPr
      ? "Verified generated version PR; existing changesets were consumed."
      : `Found ${changesets.length} new changeset(s) against ${base}.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
