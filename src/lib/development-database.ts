import path from "node:path";

// Development must never connect to an inherited production PostgreSQL URL.
export function developmentDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  const filename = url?.startsWith("file:") ? url.slice(5) : ".cache/dev.db";
  return `file:${path.resolve(filename)}`;
}
