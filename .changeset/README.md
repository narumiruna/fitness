# Changesets

Each PR must add a new `.changeset/*.md` file. Use package changesets for
user-visible changes. Use an empty changeset for tooling, documentation, or
private implementation changes that do not need a version bump.

Use `npm run changeset` to create a package changeset. To create an empty
changeset without a prompt, add a uniquely named Markdown file with this content:

```md
---
---
```

All workspace packages remain private. Changesets manage versions and changelogs
only. Do not publish packages or create release tags.

See [the release process](../docs/releasing.md) for checks and release steps.
