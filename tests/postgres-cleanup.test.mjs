import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import test from "node:test";
import { setTimeout } from "node:timers/promises";

const realDocker = spawnSync("which", ["docker"], {
  encoding: "utf8",
}).stdout.trim();

for (const signal of ["SIGINT", "SIGTERM"]) {
  test(`UI startup removes its PostgreSQL container after ${signal}`, {
    timeout: 30_000,
  }, async () => {
    const directory = mkdtempSync(join(tmpdir(), "fitness-cancellation-"));
    const marker = join(directory, "container");
    // Keep the real container running but unavailable, so startup cannot finish.
    writeFileSync(
      join(directory, "docker"),
      `#!${process.execPath}
const { spawnSync } = require("node:child_process");
const { writeFileSync } = require("node:fs");
const args = process.argv.slice(2);
if (args[0] === "run") {
  const image = args.pop();
  args.push("--entrypoint", "sleep", image, "120");
}
const result = spawnSync(${JSON.stringify(realDocker)}, args, { encoding: "utf8" });
if (args[0] === "port" && result.status === 0) {
  writeFileSync(${JSON.stringify(marker)}, args[1]);
}
process.stdout.write(result.stdout || "");
process.stderr.write(result.stderr || "");
process.exit(result.status ?? 1);
`,
      { mode: 0o755 },
    );
    const child = spawn(
      process.execPath,
      ["tests/run-ui.mjs", "--production"],
      {
        env: {
          ...process.env,
          PATH: `${directory}${delimiter}${process.env.PATH}`,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    const exited = new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, exitSignal) =>
        resolve({ code, signal: exitSignal }),
      );
    });
    try {
      for (let attempt = 0; !existsSync(marker); attempt++) {
        assert.equal(child.exitCode, null, output);
        assert.equal(child.signalCode, null, output);
        assert.ok(
          attempt < 100,
          `Container did not reach readiness polling. ${output}`,
        );
        await setTimeout(100);
      }
      const name = readFileSync(marker, "utf8");
      child.kill(signal);
      const result = await exited;
      const remaining = spawnSync(
        realDocker,
        [
          "ps",
          "--all",
          "--filter",
          `name=^/${name}$`,
          "--format",
          "{{.Names}}",
        ],
        { encoding: "utf8" },
      );
      assert.equal(remaining.status, 0, remaining.stderr);
      assert.equal(
        remaining.stdout.trim(),
        "",
        "Startup left its database container running.",
      );
      assert.deepEqual(
        result,
        { code: signal === "SIGINT" ? 130 : 143, signal: null },
        output,
      );
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        await exited;
      }
      if (existsSync(marker)) {
        spawnSync(realDocker, ["rm", "--force", readFileSync(marker, "utf8")]);
      }
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
