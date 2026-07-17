#!/usr/bin/env node
const { existsSync, writeFileSync, readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");

const targetRoot = process.env.INIT_CWD || process.cwd();
const packageRoot = resolve(__dirname, "..");

if (resolve(targetRoot) === packageRoot || !existsSync(join(targetRoot, "package.json"))) {
  process.exit(0);
}

const packageJsonPath = join(targetRoot, "package.json");

const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const scripts = packageJson.scripts || {};
const nextScripts = { ...scripts };

if (!nextScripts.setup) {
  nextScripts.setup = "expofacto setup";
}

if (!nextScripts.deploy) {
  nextScripts.deploy = "expofacto deploy";
}

if (!scripts.setup || !scripts.deploy) {
  writeFileSync(packageJsonPath, `${JSON.stringify({ ...packageJson, scripts: nextScripts }, null, 2)}\n`);
}
