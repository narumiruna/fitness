import { execFileSync } from "node:child_process";

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: "pipe" }).trim();
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
  const changesets = paths.filter(
    (path) =>
      /^\.changeset\/[^/]+\.md$/.test(path) && path !== ".changeset/README.md",
  );
  if (changesets.length === 0) {
    throw new Error(
      `No new changeset found against ${base}. Add a package changeset or an empty changeset for tooling/docs-only work.`,
    );
  }
  console.log(`Found ${changesets.length} new changeset(s) against ${base}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
