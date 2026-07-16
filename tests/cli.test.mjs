import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const runNode = (args, options) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, options);
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

test("logs fetches hosted job events with the API token", async () => {
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
    const result = await runNode(["dist/cli/main.js", "logs", "job-1"], {
      cwd: packageRoot,
      env: {
        FACTO_API_KEY: "facto_test",
        FACTO_API_TOKEN: "",
        FACTO_CONTROLLER_URL: `http://127.0.0.1:${address.port}`,
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
