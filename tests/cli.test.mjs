import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import test from "node:test";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = join(packageRoot, "dist/cli/main.js");

const runNode = (args, options) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      ...options,
      env: {
        EXPOFACTO_TELEMETRY_DISABLED: "1",
        ...options.env,
      },
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", reject);
    child.on("close", (status) => {
      resolve({ status, stdout, stderr });
    });
  });

test("deploy --help is read-only and does not require controller credentials", () => {
  const result = spawnSync(process.execPath, ["dist/cli/main.js", "deploy", "--help"], {
    cwd: packageRoot,
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Usage: expofacto setup/);
  assert.doesNotMatch(result.stderr, /controller-url is required/);
});

test("logs fetches hosted job events with EXPOFACTO_API_KEY", async () => {
  let authorization = "";
  const server = createServer((request, response) => {
    authorization = request.headers.authorization ?? "";
    assert.equal(request.method, "GET");
    assert.equal(request.url, "/api/jobs/job-1/events");
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        events: [
          {
            id: "event-1",
            event_type: "log.line",
            step: "build",
            message: "hello",
            created_at: "2026-07-16T00:11:53.000Z",
          },
        ],
      })
    );
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");

  try {
    const result = await runNode(["dist/cli/main.js", "logs", "job-1", "--controller-url", `http://127.0.0.1:${address.port}`], {
      cwd: packageRoot,
      env: {
        EXPOFACTO_API_KEY: "facto_test",
        FACTO_ENV_FILE: "/tmp/facto-cli-test-no-env-file",
        PATH: process.env.PATH,
      },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(authorization, "Bearer facto_test");
    assert.match(result.stdout, /2026-07-16T00:11:53.000Z log.line build: hello/);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("env commands manage Expo Facto account values with EAS-shaped flags", async () => {
  const requests = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      requests.push({
        method: request.method,
        url: request.url,
        authorization: request.headers.authorization,
        body: body ? JSON.parse(body) : null,
      });
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");
  const controllerUrl = `http://127.0.0.1:${address.port}`;
  const env = {
    EXPOFACTO_API_KEY: "facto_test",
    FACTO_ENV_FILE: "/tmp/facto-cli-test-no-env-file",
    PATH: process.env.PATH,
  };

  try {
    const createResult = await runNode(
      [
        cliPath,
        "env:create",
        "--controller-url",
        controllerUrl,
        "--name",
        "EXPO_TOKEN",
        "--value",
        "expo_secret_token",
        "--environment",
        "production",
        "--visibility",
        "secret",
      ],
      { cwd: packageRoot, env }
    );
    const updateResult = await runNode(
      [
        cliPath,
        "env:update",
        "--controller-url",
        controllerUrl,
        "--api-key",
        "facto_override",
        "--name",
        "EXPO_TOKEN",
        "--value",
        "new_secret",
        "--environment",
        "production",
        "--visibility",
        "secret",
      ],
      { cwd: packageRoot, env }
    );
    const deleteResult = await runNode(
      [cliPath, "env:delete", "--controller-url", controllerUrl, "--name", "EXPO_TOKEN"],
      { cwd: packageRoot, env }
    );

    assert.equal(createResult.status, 0, createResult.stderr);
    assert.equal(updateResult.status, 0, updateResult.stderr);
    assert.equal(deleteResult.status, 0, deleteResult.stderr);
    assert.match(createResult.stdout, /created EXPO_TOKEN in production/);
    assert.doesNotMatch(createResult.stdout, /expo_secret_token/);
    assert.match(updateResult.stdout, /updated EXPO_TOKEN in production/);
    assert.match(deleteResult.stdout, /deleted EXPO_TOKEN/);
    assert.deepEqual(
      requests.map((request) => [request.method, request.url, request.authorization]),
      [
        ["POST", "/api/env", "Bearer facto_test"],
        ["PATCH", "/api/env", "Bearer facto_override"],
        ["DELETE", "/api/env", "Bearer facto_test"],
      ]
    );
    assert.deepEqual(requests[0].body, {
      name: "EXPO_TOKEN",
      value: "expo_secret_token",
      environment: "production",
      visibility: "secret",
    });
    assert.deepEqual(requests[1].body, {
      name: "EXPO_TOKEN",
      value: "new_secret",
      environment: "production",
      visibility: "secret",
    });
    assert.deepEqual(requests[2].body, { name: "EXPO_TOKEN" });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("build accepts the EAS-shaped platform flag", async () => {
  const result = await runNode([cliPath, "build", "--platform", "ios", "--profile", "production"], {
    cwd: packageRoot,
    env: {
      FACTO_ENV_FILE: "/tmp/facto-cli-test-no-env-file",
      PATH: process.env.PATH,
    },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /api-key or EXPOFACTO_API_KEY is required/);
  assert.doesNotMatch(result.stderr, /Usage: expofacto setup/);
});

test("build rejects the old positional platform form", async () => {
  const result = await runNode([cliPath, "build", "ios"], {
    cwd: packageRoot,
    env: {
      FACTO_ENV_FILE: "/tmp/facto-cli-test-no-env-file",
      PATH: process.env.PATH,
    },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Use expofacto build --platform ios instead of expofacto build ios/);
});

test("build rejects old job-shaping flags", async () => {
  const result = await runNode([cliPath, "build", "--platform", "ios", "--repo", "git@example.com:owner/repo.git"], {
    cwd: packageRoot,
    env: {
      EXPOFACTO_API_KEY: "facto_test",
      FACTO_ENV_FILE: "/tmp/facto-cli-test-no-env-file",
      PATH: process.env.PATH,
    },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unsupported option --repo/);
});

test("setup does not create an expofacto directory", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "expofacto-setup-"));
  writeFileSync(join(cwd, "package.json"), JSON.stringify({ name: "app", scripts: {} }, null, 2));

  const result = await runNode([cliPath, "setup"], {
    cwd,
    env: {
      FACTO_ENV_FILE: "/tmp/facto-cli-test-no-env-file",
      PATH: process.env.PATH,
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(cwd, ".expofacto")), false);

  const packageJson = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
  assert.equal(packageJson.scripts.setup, "expofacto setup");
  assert.equal(packageJson.scripts.deploy, "expofacto deploy");
});

test("build infers app metadata and reads expofacto prebuild commands", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "expofacto-build-"));
  const origin = join(tmp, "origin.git");
  const repo = join(tmp, "repo");
  const app = join(repo, "packages/app");

  const git = (args, cwd) => {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };

  git(["init", "--bare", origin], tmp);
  mkdirSync(app, { recursive: true });
  git(["init"], repo);
  git(["config", "user.email", "tests@example.com"], repo);
  git(["config", "user.name", "Expo Facto Tests"], repo);
  writeFileSync(join(app, "package.json"), JSON.stringify({ name: "@demo/ppl" }, null, 2));
  writeFileSync(
    join(app, "expofacto.json"),
    JSON.stringify({ build: { ios: { prebuild: ["npm run check", "npm run typecheck", "npm run test"] } } }, null, 2)
  );
  git(["add", "."], repo);
  git(["commit", "-m", "initial"], repo);
  git(["branch", "-M", "main"], repo);
  git(["remote", "add", "origin", origin], repo);
  git(["push", "-u", "origin", "main"], repo);

  let authorization = "";
  let payload;
  const server = createServer((request, response) => {
    authorization = request.headers.authorization ?? "";
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/api/jobs");

    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      payload = JSON.parse(body);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ job: { id: "job-1" }, url: "http://example.test/jobs/job-1" }));
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");

  try {
    const result = await runNode(
      [
        cliPath,
        "build",
        "--controller-url",
        `http://127.0.0.1:${address.port}`,
        "--api-key",
        "facto_test",
        "--platform",
        "ios",
        "--profile",
        "production",
        "--auto-submit",
      ],
      {
        cwd: app,
        env: {
          FACTO_ENV_FILE: "/tmp/facto-cli-test-no-env-file",
          PATH: process.env.PATH,
        },
      }
    );

    assert.equal(result.status, 0, result.stderr);
    assert.equal(authorization, "Bearer facto_test");
    assert.equal(payload.project, "ppl");
    assert.equal(payload.repoUrl, origin);
    assert.equal(payload.appPath, "packages/app");
    assert.equal(payload.platform, "ios");
    assert.equal(payload.profile, "production");
    assert.equal(payload.submit, "testflight");
    assert.deepEqual(payload.checks, ["npm run check", "npm run typecheck", "npm run test"]);
    assert.match(payload.gitRef, /^[0-9a-f]{40}$/);
    assert.match(result.stdout, /\/api\/jobs\/job-1/);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
