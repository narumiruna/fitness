import { fileURLToPath } from "node:url";
// Both src/ and dist/ have the same depth below the API workspace.
export const repositoryRoot = fileURLToPath(
  new URL("../../../", import.meta.url),
);
