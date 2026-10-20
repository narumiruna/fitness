import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "dotenv";
import { repositoryRoot } from "../paths.js";

// Existing environment > mode-local > local > mode > base. Test mode skips
// .env.local, as before. Values already set by the process are never replaced.
export function loadEnvironment(
  root = repositoryRoot,
  mode = process.env.NODE_ENV ?? "development",
  env: NodeJS.ProcessEnv = process.env,
) {
  const files = [
    `.env.${mode}.local`,
    ...(mode === "test" ? [] : [".env.local"]),
    `.env.${mode}`,
    ".env",
  ];
  for (const file of files) {
    const filename = path.join(root, file);
    if (!existsSync(filename)) continue;
    const values = parse(readFileSync(filename));
    const expand = (name: string, seen = new Set<string>()): string => {
      if (env[name] !== undefined) return env[name] as string;
      if (seen.has(name)) return "";
      seen.add(name);
      return (values[name] ?? "").replace(
        /(\\)?\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))/g,
        (match, escaped: string, braced: string, plain: string) =>
          escaped ? match.slice(1) : expand(braced ?? plain, new Set(seen)),
      );
    };
    for (const name of Object.keys(values))
      if (env[name] === undefined) env[name] = expand(name);
  }
  return env;
}
