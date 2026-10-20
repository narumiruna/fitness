import path from "node:path";
import { repositoryRoot } from "../paths.js";
export function developmentDatabaseUrl(root = repositoryRoot) {
  const url = process.env.DATABASE_URL;
  const file = url?.startsWith("file:") ? url.slice(5) : ".cache/dev.db";
  return `file:${path.resolve(root, file)}`;
}
