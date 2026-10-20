import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Resolve all schema and client paths from this repository, not the caller's cwd.
process.chdir(fileURLToPath(new URL("../", import.meta.url)));
const source = readFileSync("prisma/schema.prisma", "utf8");
mkdirSync("prisma/.dev", { recursive: true });
mkdirSync(".cache", { recursive: true });
writeFileSync(
  "prisma/.dev/schema.prisma",
  source
    .replace('provider = "postgresql"', 'provider = "sqlite"')
    .replace(
      '"../apps/api/src/generated/prisma"',
      '"../../apps/api/src/generated/prisma-sqlite"',
    ),
);

for (const config of ["prisma.config.ts", "prisma-dev.config.ts"]) {
  const result = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "generate", "--config", config],
    { stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
