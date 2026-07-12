#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const { existsSync, writeFileSync } = require("node:fs");
const { homedir } = require("node:os");
const { join, resolve } = require("node:path");

const requiredMajor = 24;
const packageRoot = resolve(__dirname, "..");
const mainPath = join(packageRoot, "dist", "cli", "main.js");
const args = process.argv.slice(2);

const nodeMajor = () => Number(process.versions.node.split(".")[0]);

const run = (command, commandArgs, options = {}) => {
  const result = spawnSync(command, commandArgs, { stdio: "inherit", ...options });
  process.exit(result.status ?? 1);
};

const writeRunnerNvmrc = () => {
  writeFileSync(join(process.cwd(), ".nvmrc"), `${requiredMajor}\n`);
};

const nvmCandidates = () => [
  process.env.NVM_DIR ? join(process.env.NVM_DIR, "nvm.sh") : "",
  join(homedir(), ".nvm", "nvm.sh"),
  "/opt/homebrew/opt/nvm/nvm.sh",
  "/usr/local/opt/nvm/nvm.sh",
];

const findNvm = () => nvmCandidates().find((path) => path && existsSync(path));

const runWithNvm = (nvmScript) => {
  writeRunnerNvmrc();
  const script = [
    `. "${nvmScript}"`,
    `nvm install ${requiredMajor}`,
    `nvm exec ${requiredMajor} node "$FACTO_MAIN" "$@"`,
  ].join(" && ");

  run("bash", ["-lc", script, "expofacto", ...args], {
    env: { ...process.env, FACTO_MAIN: mainPath },
  });
};

const askYesNo = (question) => {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return false;
  }

  process.stdout.write(`${question} [y/N] `);
  const buffer = Buffer.alloc(16);
  const bytes = require("node:fs").readSync(0, buffer, 0, buffer.length, null);
  return buffer.toString("utf8", 0, bytes).trim().toLowerCase().startsWith("y");
};

const runWithHomebrew = () => {
  if (!askYesNo("nvm was not found. Install Node.js 24 with Homebrew for this run?")) {
    return false;
  }

  const install = spawnSync("brew", ["install", "node@24"], { stdio: "inherit" });

  if (install.status !== 0) {
    process.exit(install.status ?? 1);
  }

  const prefix = spawnSync("brew", ["--prefix", "node@24"], { encoding: "utf8" });
  const nodePath = join(prefix.stdout.trim(), "bin", "node");

  if (!existsSync(nodePath)) {
    return false;
  }

  writeRunnerNvmrc();
  run(nodePath, [mainPath, ...args]);
  return true;
};

if (nodeMajor() >= requiredMajor) {
  writeRunnerNvmrc();
  run(process.execPath, [mainPath, ...args]);
}

const nvmScript = findNvm();

if (nvmScript) {
  runWithNvm(nvmScript);
}

if (spawnSync("brew", ["--version"], { stdio: "ignore" }).status === 0 && runWithHomebrew()) {
  process.exit(0);
}

console.error(`Expo Facto needs Node.js ${requiredMajor}+ for the runner. Current Node.js is ${process.version}.`);
console.error("Install nvm or Node.js 24, then rerun the same command.");
process.exit(1);
