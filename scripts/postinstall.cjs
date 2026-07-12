#!/usr/bin/env node
const { existsSync, mkdirSync, writeFileSync, chmodSync, readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");

const targetRoot = process.env.INIT_CWD || process.cwd();
const packageRoot = resolve(__dirname, "..");

if (resolve(targetRoot) === packageRoot || !existsSync(join(targetRoot, "package.json"))) {
  process.exit(0);
}

const expofactoDir = join(targetRoot, ".expofacto");
const deployPath = join(expofactoDir, "deploy.sh");
const nestedGitignorePath = join(expofactoDir, ".gitignore");
const rootGitignorePath = join(targetRoot, ".gitignore");
const packageJsonPath = join(targetRoot, "package.json");

mkdirSync(expofactoDir, { recursive: true });

if (!existsSync(deployPath)) {
  writeFileSync(
    deployPath,
    `#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f .expofacto/secrets.env ]]; then
  set -a
  source .expofacto/secrets.env
  set +a
fi

exec npx --package @expofacto/cli expofacto deploy "$@"
`
  );
  chmodSync(deployPath, 0o755);
}

if (!existsSync(nestedGitignorePath)) {
  writeFileSync(nestedGitignorePath, "*.env\n*.p8\nkeys/\nartifacts/\nworkspaces/\ncontroller.sqlite\n");
}

const patterns = [
  ".expofacto/*.env",
  ".expofacto/*.p8",
  ".expofacto/keys/",
  ".expofacto/artifacts/",
  ".expofacto/workspaces/",
  ".expofacto/controller.sqlite",
];
const existingGitignore = existsSync(rootGitignorePath) ? readFileSync(rootGitignorePath, "utf8") : "";
const missingPatterns = patterns.filter((pattern) => !existingGitignore.split(/\r?\n/).includes(pattern));

if (missingPatterns.length > 0) {
  const prefix = existingGitignore && !existingGitignore.endsWith("\n") ? "\n" : "";
  writeFileSync(rootGitignorePath, `${existingGitignore}${prefix}${missingPatterns.join("\n")}\n`);
}

const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const scripts = packageJson.scripts || {};
const nextScripts = { ...scripts };

if (!nextScripts.setup) {
  nextScripts.setup = "expofacto setup";
}

if (!nextScripts.deploy) {
  nextScripts.deploy = ".expofacto/deploy.sh";
}

if (!scripts.setup || !scripts.deploy) {
  writeFileSync(packageJsonPath, `${JSON.stringify({ ...packageJson, scripts: nextScripts }, null, 2)}\n`);
}
