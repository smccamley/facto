import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { easBuildArgs, easSubmitArgs, runJob } from "../dist/worker/runJob.js";

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

test("EAS submit runs through the eas binary and does not inherit build verbosity", () => {
  const args = easSubmitArgs("/tmp/ppl.ipa");

  assert.deepEqual(args.slice(0, 5), ["--yes", "--package", "eas-cli@latest", "eas", "submit"]);
  assert.ok(!args.includes("--verbose"));
  assert.ok(!args.includes("--verbose-logs"));
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
      {
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
      },
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
