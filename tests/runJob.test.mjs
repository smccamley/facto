import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { easBuildArgs, easCliBinPath, easCliInstallArgs, easSubmitArgs, jobToolchainChecks, resolveEasEnvironment, runJob } from "../dist/worker/runJob.js";

const writeExecutable = (path, contents) => {
  writeFileSync(path, contents);
  chmodSync(path, 0o755);
};

test("EAS build runs through the local eas binary", () => {
  const args = easBuildArgs({ profile: "production" }, "/tmp/ppl.ipa", { verbose: true });

  assert.equal(args[0], "build");
  assert.ok(!args.includes("--package"));
  assert.ok(args.includes("--verbose-logs"));
  assert.ok(!args.includes("--verbose"));
});

test("toolchain preflight validates that the EAS CLI package can be resolved", () => {
  const easCheck = jobToolchainChecks().find((check) => check.name === "EAS CLI package");
  const toolPath = "/tmp/facto-eas-cli";

  assert.deepEqual(easCheck?.args, ["view", "eas-cli", "version"]);
  assert.deepEqual(easCliInstallArgs(toolPath), ["install", "--prefix", toolPath, "--no-save", "--no-package-lock", "eas-cli@latest"]);
  assert.equal(easCliBinPath(toolPath), join(toolPath, "node_modules", ".bin", "eas"));
  assert.equal(easBuildArgs({ profile: "production" }, "/tmp/ppl.ipa")[0], "build");
});

test("EAS submit runs through the eas binary and does not inherit build verbosity", () => {
  const args = easSubmitArgs({ profile: "production" }, "/tmp/ppl.ipa");

  assert.equal(args[0], "submit");
  assert.deepEqual(args.slice(1, 5), ["--platform", "ios", "--profile", "production"]);
  assert.ok(!args.includes("--package"));
  assert.ok(!args.includes("--verbose"));
  assert.ok(!args.includes("--verbose-logs"));
});

test("EAS environment resolves from the selected build profile", () => {
  const dir = mkdtempSync(join(tmpdir(), "facto-eas-env-profile-"));

  try {
    writeFileSync(
      join(dir, "eas.json"),
      JSON.stringify(
        {
          build: {
            base: { environment: "production" },
            staging: { extends: "base", environment: "preview" },
            development: { developmentClient: true },
          },
        },
        null,
        2
      )
    );

    assert.equal(resolveEasEnvironment(dir, "staging"), "preview");
    assert.equal(resolveEasEnvironment(dir, "development"), "development");
    assert.equal(resolveEasEnvironment(dir, "production"), "production");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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

test("runner uses leased EXPO_TOKEN to pull EAS environment variables", async () => {
  const dir = mkdtempSync(join(tmpdir(), "facto-run-job-token-"));
  const binDir = join(dir, "bin");
  const workspaceRoot = join(dir, "workspaces");
  const installMarker = join(dir, "install-complete");
  const tokenRecord = join(dir, "token-record");
  const oldPath = process.env.PATH;

  try {
    mkdirSync(binDir, { recursive: true });
    writeExecutable(
      join(binDir, "git"),
      `#!/usr/bin/env bash
set -euo pipefail
case "$1" in
  --version) printf 'git version test\\n' ;;
  clone) mkdir -p "$3/.git"; printf '{"build":{"production":{"environment":"production"}}}' > "$3/eas.json" ;;
  fetch|checkout|reset|clean) ;;
  rev-parse) printf 'abc123\\n' ;;
esac
`
    );
    writeExecutable(
      join(binDir, "npm"),
      `#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "--version" ]]; then
  printf '10.0.0\\n'
  exit 0
fi
if [[ "$1" == "view" ]]; then
  printf '99.0.0\\n'
  exit 0
fi
if [[ "$1" == "install" ]]; then
  prefix=""
  for ((i = 1; i <= $#; i++)); do
    if [[ "\${!i}" == "--prefix" ]]; then
      next=$((i + 1))
      prefix="\${!next}"
    fi
  done
  mkdir -p "$prefix/node_modules/.bin"
  cat > "$prefix/node_modules/.bin/eas" <<'EAS'
#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "env:pull" ]]; then
  if [[ ! -f "${installMarker}" ]]; then
    printf 'node_modules missing\\n' >&2
    exit 42
  fi
  printf '%s\\n' "$EXPO_TOKEN" > "${tokenRecord}"
  env_path=""
  for ((i = 1; i <= $#; i++)); do
    if [[ "\${!i}" == "--path" ]]; then
      next=$((i + 1))
      env_path="\${!next}"
    fi
  done
  mkdir -p "$(dirname "$env_path")"
  printf 'EXPO_PUBLIC_API_URL=https://api.example.test\\n' > "$env_path"
  exit 0
fi
if [[ "$1" == "build" ]]; then
  output_path=""
  for ((i = 1; i <= $#; i++)); do
    if [[ "\${!i}" == "--output" ]]; then
      next=$((i + 1))
      output_path="\${!next}"
    fi
  done
  mkdir -p "$(dirname "$output_path")"
  printf 'ipa' > "$output_path"
fi
EAS
  chmod +x "$prefix/node_modules/.bin/eas"
fi
touch "${installMarker}"
`
    );
    writeExecutable(
      join(binDir, "npx"),
      `#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "--version" || "\${2:-}" == "--version" ]]; then
  printf 'ok\\n'
  exit 0
fi
`
    );
    process.env.PATH = `${binDir}:${oldPath}`;

    await runJob(
      {
        getJob: async () => null,
        registerArtifact: async () => undefined,
        sendEvent: async () => undefined,
      },
      buildJob({ env: { EXPO_TOKEN: "expo_from_lease" } }),
      workspaceRoot
    );

    assert.equal(readFileSync(tokenRecord, "utf8").trim(), "expo_from_lease");
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
    writeExecutable(
      join(binDir, "npm"),
      `#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "install" ]]; then
  prefix=""
  for ((i = 1; i <= $#; i++)); do
    if [[ "\${!i}" == "--prefix" ]]; then
      next=$((i + 1))
      prefix="\${!next}"
    fi
  done
  mkdir -p "$prefix/node_modules/.bin"
  printf '#!/usr/bin/env bash\\nexit 0\\n' > "$prefix/node_modules/.bin/eas"
  chmod +x "$prefix/node_modules/.bin/eas"
fi
exit 0
`
    );
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

test("runner injects pulled EAS environment variables into build commands", async () => {
  const dir = mkdtempSync(join(tmpdir(), "facto-run-job-env-"));
  const binDir = join(dir, "bin");
  const workspaceRoot = join(dir, "workspaces");
  const envRecord = join(dir, "env-record");
  const oldPath = process.env.PATH;
  const events = [];

  try {
    mkdirSync(binDir, { recursive: true });

    writeExecutable(
      join(binDir, "git"),
      `#!/usr/bin/env bash
set -euo pipefail
case "$1" in
  --version)
    printf 'git version test\\n'
    ;;
  clone)
    mkdir -p "$3/.git"
    cat > "$3/eas.json" <<'JSON'
{"build":{"production":{"environment":"production"}}}
JSON
    ;;
  fetch|checkout|reset|clean)
    ;;
  rev-parse)
    printf 'abc123\\n'
    ;;
esac
`
    );
    writeExecutable(
      join(binDir, "npm"),
      `#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "--version" ]]; then
  printf '10.0.0\\n'
  exit 0
fi
if [[ "$1" == "view" ]]; then
  printf '99.0.0\\n'
  exit 0
fi
if [[ "$1" == "install" ]]; then
  prefix=""
  for ((i = 1; i <= $#; i++)); do
    if [[ "\${!i}" == "--prefix" ]]; then
      next=$((i + 1))
      prefix="\${!next}"
    fi
  done
  mkdir -p "$prefix/node_modules/.bin"
  cat > "$prefix/node_modules/.bin/eas" <<'EAS'
#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "env:pull" ]]; then
  env_path=""
  for ((i = 1; i <= $#; i++)); do
    if [[ "\${!i}" == "--path" ]]; then
      next=$((i + 1))
      env_path="\${!next}"
    fi
  done
  mkdir -p "$(dirname "$env_path")"
  printf 'EXPO_PUBLIC_API_URL=https://api.example.test\\nAPP_VARIANT=production\\n' > "$env_path"
  exit 0
fi
if [[ "$1" == "build" ]]; then
  printf 'build=%s\\n' "$EXPO_PUBLIC_API_URL" >> "${envRecord}"
  output_path=""
  for ((i = 1; i <= $#; i++)); do
    if [[ "\${!i}" == "--output" ]]; then
      next=$((i + 1))
      output_path="\${!next}"
    fi
  done
  mkdir -p "$(dirname "$output_path")"
  printf 'ipa' > "$output_path"
  exit 0
fi
EAS
  chmod +x "$prefix/node_modules/.bin/eas"
fi
printf 'install=%s\\n' "\${EXPO_PUBLIC_API_URL:-}" >> "${envRecord}"
`
    );
    writeExecutable(
      join(binDir, "npx"),
      `#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "--version" ]]; then
  printf '10.0.0\\n'
  exit 0
fi
if [[ "$1" == "expo" && "$2" == "prebuild" ]]; then
  printf 'prebuild=%s\\n' "$EXPO_PUBLIC_API_URL" >> "${envRecord}"
  exit 0
fi
exit 0
`
    );
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

    assert.match(readFileSync(envRecord, "utf8"), /install=\n/);
    assert.match(readFileSync(envRecord, "utf8"), /prebuild=https:\/\/api\.example\.test/);
    assert.match(readFileSync(envRecord, "utf8"), /build=https:\/\/api\.example\.test/);
    assert.ok(
      events.some(
        (event) => event.type === "log.line" && event.step === "environment" && /Loaded readable EAS environment variables for production/.test(event.line)
      )
    );
  } finally {
    process.env.PATH = oldPath;
    rmSync(dir, { recursive: true, force: true });
  }
});
