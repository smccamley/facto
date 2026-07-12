import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type PackageJson = {
  name?: string;
  scripts?: Record<string, string>;
};

type SetupResult = {
  created: string[];
  updated: string[];
  missing: string[];
};

const expofactoDir = ".expofacto";
const configPath = join(expofactoDir, "config.yml");
const secretsPath = join(expofactoDir, "secrets.env");
const deployPath = join(expofactoDir, "deploy.sh");
const gitignorePath = ".gitignore";

const readPackageJson = (): PackageJson => {
  if (!existsSync("package.json")) {
    return {};
  }

  return JSON.parse(readFileSync("package.json", "utf8")) as PackageJson;
};

const readEnvFile = (path: string) => {
  if (!existsSync(path)) {
    return {};
  }

  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const equalsIndex = line.indexOf("=");
        return [line.slice(0, equalsIndex).trim(), line.slice(equalsIndex + 1).trim()];
      })
  ) as Record<string, string>;
};

const getExistingValue = (files: Record<string, string>[], key: string) => {
  return process.env[key] ?? files.find((file) => file[key])?.[key] ?? "";
};

const runGit = (args: string[]) => {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
};

const detectPackageManager = () => {
  if (existsSync("pnpm-lock.yaml")) {
    return "pnpm";
  }

  if (existsSync("yarn.lock")) {
    return "yarn";
  }

  return "npm";
};

const detectChecks = (packageJson: PackageJson, packageManager: string) => {
  const scripts = packageJson.scripts ?? {};
  const checkNames = ["check", "typecheck", "test"].filter((name) => {
    return scripts[name] && scripts[name] !== 'echo "Error: no test specified" && exit 1';
  });

  return checkNames.map((name) => `  - ${packageManager} run ${name}`).join("\n");
};

const yamlString = (value: string) => JSON.stringify(value);

const createConfig = () => {
  const packageJson = readPackageJson();
  const packageManager = detectPackageManager();
  const projectName = packageJson.name?.replace(/^@[^/]+\//, "") || "app";
  const repoUrl = runGit(["remote", "get-url", "origin"]);
  const defaultRef = runGit(["branch", "--show-current"]) || "main";
  const checks = detectChecks(packageJson, packageManager);

  return `version: 1
project: ${yamlString(projectName)}
defaultPlatform: ios
repo:
  provider: github
  url: ${yamlString(repoUrl)}
  defaultRef: ${yamlString(defaultRef)}
app:
  path: .
  packageManager: ${yamlString(packageManager)}
ios:
  profile: production
  submit: testflight
checks:
${checks || "  []"}
env:
  required:
    - EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
    - EXPO_PUBLIC_OPEN_MEMORIES_API_URL
    - OPEN_MEMORIES_CLERK_ENV
secrets:
  required:
    - FACTO_CONTROLLER_URL
    - FACTO_API_TOKEN
    - EXPO_TOKEN
`;
};

const createSecrets = () => {
  const envFiles = [readEnvFile(".env"), readEnvFile(".env.local"), readEnvFile(secretsPath)];
  const values = {
    FACTO_CONTROLLER_URL: getExistingValue(envFiles, "FACTO_CONTROLLER_URL"),
    FACTO_API_TOKEN: getExistingValue(envFiles, "FACTO_API_TOKEN"),
    EXPO_TOKEN: getExistingValue(envFiles, "EXPO_TOKEN"),
    EXPO_PUBLIC_OPEN_MEMORIES_API_URL: getExistingValue(envFiles, "EXPO_PUBLIC_OPEN_MEMORIES_API_URL"),
    EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: getExistingValue(envFiles, "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY"),
    OPEN_MEMORIES_CLERK_ENV: getExistingValue(envFiles, "OPEN_MEMORIES_CLERK_ENV") || "live",
    EXPO_ASC_API_KEY_PATH: getExistingValue(envFiles, "EXPO_ASC_API_KEY_PATH"),
    EXPO_ASC_KEY_ID: getExistingValue(envFiles, "EXPO_ASC_KEY_ID"),
    EXPO_ASC_ISSUER_ID: getExistingValue(envFiles, "EXPO_ASC_ISSUER_ID"),
    EXPO_APPLE_ID: getExistingValue(envFiles, "EXPO_APPLE_ID"),
    EXPO_APPLE_APP_SPECIFIC_PASSWORD: getExistingValue(envFiles, "EXPO_APPLE_APP_SPECIFIC_PASSWORD"),
  };

  return Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")
    .concat("\n");
};

const createDeployScript = () => {
  return `#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f .expofacto/secrets.env ]]; then
  set -a
  source .expofacto/secrets.env
  set +a
fi

exec npx --package @expofacto/cli expofacto deploy "$@"
`;
};

const writeIfMissing = (path: string, content: string, mode?: number, result?: SetupResult) => {
  if (existsSync(path)) {
    return;
  }

  writeFileSync(path, content);

  if (mode) {
    chmodSync(path, mode);
  }

  result?.created.push(path);
};

const appendGitignorePatterns = (result: SetupResult) => {
  const patterns = [
    ".expofacto/*.env",
    ".expofacto/*.p8",
    ".expofacto/keys/",
    ".expofacto/artifacts/",
    ".expofacto/workspaces/",
    ".expofacto/controller.sqlite",
  ];
  const existing = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf8") : "";
  const missingPatterns = patterns.filter((pattern) => !existing.split(/\r?\n/).includes(pattern));

  if (missingPatterns.length === 0) {
    return;
  }

  const prefix = existing && !existing.endsWith("\n") ? "\n" : "";
  writeFileSync(gitignorePath, `${existing}${prefix}${missingPatterns.join("\n")}\n`);
  result.updated.push(gitignorePath);
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
    nextScripts.deploy = ".expofacto/deploy.sh";
  }

  if (nextScripts === scripts || (scripts.setup && scripts.deploy)) {
    return;
  }

  writeFileSync("package.json", `${JSON.stringify({ ...packageJson, scripts: nextScripts }, null, 2)}\n`);
  result.updated.push("package.json");
};

const missingRequiredValues = () => {
  const values = readEnvFile(secretsPath);

  return ["FACTO_CONTROLLER_URL", "FACTO_API_TOKEN", "EXPO_TOKEN"].filter((key) => !values[key]);
};

export const setupProject = () => {
  const result: SetupResult = { created: [], updated: [], missing: [] };

  mkdirSync(expofactoDir, { recursive: true });
  writeIfMissing(configPath, createConfig(), undefined, result);
  writeIfMissing(secretsPath, createSecrets(), 0o600, result);
  writeIfMissing(deployPath, createDeployScript(), 0o755, result);
  writeIfMissing(join(expofactoDir, ".gitignore"), "*.env\n*.p8\nkeys/\nartifacts/\nworkspaces/\ncontroller.sqlite\n", undefined, result);
  appendGitignorePatterns(result);
  updatePackageScripts(result);
  result.missing = missingRequiredValues();

  return result;
};
