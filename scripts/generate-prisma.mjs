import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const source = readFileSync("prisma/schema.prisma", "utf8");
mkdirSync("prisma/.dev", { recursive: true });
mkdirSync(".cache", { recursive: true });
writeFileSync(
  "prisma/.dev/schema.prisma",
  source
    .replace('provider = "postgresql"', 'provider = "sqlite"')
    .replace(
      '"../src/generated/prisma"',
      '"../../src/generated/prisma-sqlite"',
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
