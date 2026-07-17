import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runCommand } from "../dist/worker/runCommand.js";

const writeExecutable = (path, contents) => {
  writeFileSync(path, contents);
  chmodSync(path, 0o755);
};

test("runCommand records a clear log line when an executable is missing", async () => {
  const dir = mkdtempSync(join(tmpdir(), "facto-run-command-"));
  const events = [];

  try {
    const exitCode = await runCommand({
      jobId: "job-1",
      step: "checkout",
      command: "definitely-not-a-facto-command",
      args: ["clone"],
      cwd: dir,
      client: {
        sendEvent: async (_jobId, event) => {
          events.push(event);
        },
      },
    });

    assert.equal(exitCode, 127);
    assert.match(events.at(-1).line, /Unable to start definitely-not-a-facto-command/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("runCommand does not leak parent npx package mode into child commands", async () => {
  const dir = mkdtempSync(join(tmpdir(), "facto-run-command-env-"));
  const binDir = join(dir, "bin");
  const oldPath = process.env.PATH;
  const oldPackage = process.env.npm_config_package;

  try {
    mkdirSync(binDir, { recursive: true });
    writeExecutable(
      join(binDir, "npx"),
      `#!/usr/bin/env bash
set -euo pipefail
if [[ -n "\${npm_config_package:-}" ]]; then
  printf 'leaked npm_config_package=%s\\n' "$npm_config_package" >&2
  exit 127
fi
printf 'ok\\n'
`
    );

    process.env.PATH = `${binDir}:${oldPath}`;
    process.env.npm_config_package = "@expofacto/cli@0.1.234";

    const events = [];
    const exitCode = await runCommand({
      jobId: "job-1",
      step: "build",
      command: "npx",
      args: ["-y", "eas-cli-local-build-plugin@21.0.2", "payload"],
      cwd: dir,
      client: {
        sendEvent: async (_jobId, event) => {
          events.push(event);
        },
      },
    });

    assert.equal(exitCode, 0);
    assert.ok(events.some((event) => event.type === "log.line" && event.line === "ok"));
  } finally {
    process.env.PATH = oldPath;
    if (oldPackage === undefined) {
      delete process.env.npm_config_package;
    } else {
      process.env.npm_config_package = oldPackage;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});
