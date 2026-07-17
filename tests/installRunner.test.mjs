import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const writeExecutable = (path, contents) => {
  writeFileSync(path, contents);
  chmodSync(path, 0o755);
};

const runInstaller = (args = [], env = {}) => {
  const dir = mkdtempSync(join(tmpdir(), "facto-install-runner-"));
  const binDir = join(dir, "bin");
  const argsFile = join(dir, "npx-args.txt");

  try {
    mkdirSync(binDir);
    writeExecutable(join(binDir, "uname"), "#!/usr/bin/env bash\nprintf 'Darwin\\n'\n");
    writeExecutable(join(binDir, "node"), "#!/usr/bin/env bash\nprintf '24\\n'\n");
    writeExecutable(join(binDir, "npx"), "#!/usr/bin/env bash\nprintf '%s\\n' \"$@\" > \"$FACTO_NPX_ARGS_FILE\"\n");

    const result = spawnSync("/bin/bash", ["scripts/install-runner.sh", ...args], {
      cwd: packageRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        EXPOFACTO_API_KEY: "facto_test_key",
        FACTO_CLI_PACKAGE: "@expofacto/cli-test",
        FACTO_NPX_ARGS_FILE: argsFile,
        FACTO_RUNNER_DIR: join(dir, "runner"),
        PATH: `${binDir}:${process.env.PATH}`,
        ...env,
      },
    });

    const npxArgs = result.status === 0 ? readFileSync(argsFile, "utf8").trim().split("\n") : [];
    return { result, npxArgs };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test("install-runner starts the runner when no optional runner args are provided", () => {
  const { result, npxArgs } = runInstaller();

  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /unbound variable/);
  assert.deepEqual(npxArgs, ["--yes", "--package", "@expofacto/cli-test", "expofacto", "start", "runner"]);
});

test("install-runner forwards optional runner args", () => {
  const { result, npxArgs } = runInstaller(["--service-url", "https://example.test", "--name", "mac-mini-1", "--verbose"]);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(npxArgs, [
    "--yes",
    "--package",
    "@expofacto/cli-test",
    "expofacto",
    "start",
    "runner",
    "--service-url",
    "https://example.test",
    "--name",
    "mac-mini-1",
    "--verbose",
  ]);
});

test("install-runner accepts the short api key flag", () => {
  const { result, npxArgs } = runInstaller(["-k", "facto_from_flag"], { EXPOFACTO_API_KEY: "" });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(npxArgs, ["--yes", "--package", "@expofacto/cli-test", "expofacto", "start", "runner"]);
});

test("install-runner accepts EXPOFACTO_API_KEY", () => {
  const { result, npxArgs } = runInstaller([], { EXPOFACTO_API_KEY: "facto_from_env" });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(npxArgs, ["--yes", "--package", "@expofacto/cli-test", "expofacto", "start", "runner"]);
});

test("install-runner explains the documented env var when api key is missing", () => {
  const { result } = runInstaller([], { EXPOFACTO_API_KEY: "" });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /EXPOFACTO_API_KEY is required/);
});
