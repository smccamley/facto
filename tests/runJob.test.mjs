import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { easBuildArgs, easSubmitArgs, jobToolchainChecks, runJob } from "../dist/worker/runJob.js";

const writeExecutable = (path, contents) => {
  writeFileSync(path, contents);
  chmodSync(path, 0o755);
};

test("EAS build runs through the eas binary resolved by npx package mode", () => {
  const args = easBuildArgs({ profile: "production" }, "/tmp/ppl.ipa", { verbose: true });

  assert.deepEqual(args.slice(0, 5), ["--yes", "--package", "eas-cli@latest", "eas", "build"]);
  assert.ok(args.includes("--verbose-logs"));
  assert.ok(!args.includes("--verbose"));
});

test("toolchain preflight validates the same EAS CLI package-mode entrypoint used by builds", () => {
  const easCheck = jobToolchainChecks().find((check) => check.name === "EAS CLI package mode");

  assert.deepEqual(easCheck?.args, ["--yes", "--package", "eas-cli@latest", "eas", "--version"]);
  assert.equal(easBuildArgs({ profile: "production" }, "/tmp/ppl.ipa")[3], "eas");
});

test("EAS submit runs through the eas binary and does not inherit build verbosity", () => {
  const args = easSubmitArgs({ profile: "production" }, "/tmp/ppl.ipa");

  assert.deepEqual(args.slice(0, 5), ["--yes", "--package", "eas-cli@latest", "eas", "submit"]);
  assert.deepEqual(args.slice(5, 9), ["--platform", "ios", "--profile", "production"]);
  assert.ok(!args.includes("--verbose"));
  assert.ok(!args.includes("--verbose-logs"));
});

const buildJob = (overrides = {}) => ({
  id: "job-1",
  project: "ppl",
  platform: "ios",
  repoUrl: "git@example.com:owner/repo.git",
  gitRef: "abc123",
  appPath: ".",
  profile: "production",
  submit: "none",
  checks: [],
  status: "leased",
  currentStep: null,
  triggerSource: "hosted",
  workerName: "runner-1",
  commitSha: null,
  artifactPath: null,
  errorSummary: null,
  createdAt: "",
  updatedAt: "",
  startedAt: null,
  finishedAt: null,
  leasedAt: null,
  lastHeartbeatAt: null,
  ...overrides,
});

test("job toolchain preflight fails before checkout when git is missing", async () => {
  const dir = mkdtempSync(join(tmpdir(), "facto-run-job-preflight-"));
  const binDir = join(dir, "bin");
  const workspaceRoot = join(dir, "workspaces");
  const oldPath = process.env.PATH;
  const events = [];

  try {
    mkdirSync(binDir, { recursive: true });
    writeExecutable(join(binDir, "npm"), "#!/bin/sh\nexit 0\n");
    writeExecutable(join(binDir, "npx"), "#!/bin/sh\nexit 0\n");
    process.env.PATH = binDir;

    await runJob(
      {
        getJob: async () => null,
        registerArtifact: async () => undefined,
        sendEvent: async (_jobId, event) => {
          events.push(event);
        },
      },
      buildJob(),
      workspaceRoot
    );

    assert.ok(events.some((event) => event.type === "log.line" && event.step === "preflight" && /Git is required/.test(event.line)));
    assert.ok(events.some((event) => event.type === "step.finished" && event.step === "preflight" && event.status === "failed"));
    assert.ok(events.some((event) => event.type === "job.finished" && event.status === "failed"));
    assert.ok(!events.some((event) => event.type === "step.started" && event.step === "checkout"));
    assert.equal(existsSync(workspaceRoot), true);
  } finally {
    process.env.PATH = oldPath;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("checkout repair reclones without emitting a failed step event", async () => {
  const dir = mkdtempSync(join(tmpdir(), "facto-run-job-"));
  const binDir = join(dir, "bin");
  const workspaceRoot = join(dir, "workspaces");
  const repoPath = join(workspaceRoot, "ppl", "repo");
  const fetchMarker = join(dir, "fetch-failed");
  const oldPath = process.env.PATH;
  const events = [];

  try {
    mkdirSync(binDir, { recursive: true });
    mkdirSync(join(repoPath, ".git"), { recursive: true });

    writeExecutable(
      join(binDir, "git"),
      `#!/usr/bin/env bash
set -euo pipefail
case "$1" in
  fetch)
    if [[ ! -f "${fetchMarker}" ]]; then
      touch "${fetchMarker}"
      exit 128
    fi
    exit 0
    ;;
  clone)
    mkdir -p "$3/.git"
    exit 0
    ;;
  checkout|reset|clean)
    exit 0
    ;;
  rev-parse)
    printf 'abc123\\n'
    exit 0
    ;;
esac
exit 0
`
    );
    writeExecutable(join(binDir, "npm"), "#!/usr/bin/env bash\nexit 0\n");
    writeExecutable(join(binDir, "npx"), "#!/usr/bin/env bash\nexit 0\n");
    process.env.PATH = `${binDir}:${oldPath}`;

    await runJob(
      {
        getJob: async () => null,
        registerArtifact: async () => undefined,
        sendEvent: async (_jobId, event) => {
          events.push(event);
        },
      },
      buildJob(),
      workspaceRoot
    );

    assert.equal(readFileSync(fetchMarker, "utf8"), "");
    assert.ok(events.some((event) => event.type === "log.line" && /recloning workspace/.test(event.line)));
    assert.ok(!events.some((event) => event.type === "step.finished" && event.status === "failed"));
    assert.ok(events.some((event) => event.type === "job.finished" && event.status === "complete"));
  } finally {
    process.env.PATH = oldPath;
    rmSync(dir, { recursive: true, force: true });
  }
});
