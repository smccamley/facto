import { existsSync, readFileSync, writeFileSync } from "node:fs";

type PackageJson = {
  name?: string;
  scripts?: Record<string, string>;
};

type SetupResult = {
  created: string[];
  updated: string[];
  missing: string[];
};

const readPackageJson = (): PackageJson => {
  if (!existsSync("package.json")) {
    return {};
  }

  return JSON.parse(readFileSync("package.json", "utf8")) as PackageJson;
};

const updatePackageScripts = (result: SetupResult) => {
  if (!existsSync("package.json")) {
    return;
  }

  const packageJson = readPackageJson();
  const scripts = packageJson.scripts ?? {};
  const nextScripts = { ...scripts };

  if (!nextScripts.setup) {
    nextScripts.setup = "expofacto setup";
  }

  if (!nextScripts.deploy) {
    nextScripts.deploy = "expofacto deploy";
  }

  if (nextScripts === scripts || (scripts.setup && scripts.deploy)) {
    return;
  }

  writeFileSync("package.json", `${JSON.stringify({ ...packageJson, scripts: nextScripts }, null, 2)}\n`);
  result.updated.push("package.json");
};

export const setupProject = () => {
  const result: SetupResult = { created: [], updated: [], missing: [] };

  updatePackageScripts(result);

  return result;
};
