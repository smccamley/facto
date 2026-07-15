import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createHostedRunnerClient, hostedEventBody, mapHostedJob } from "../dist/worker/hostedClient.js";

test("mapHostedJob converts hosted API jobs into worker jobs", () => {
  const job = mapHostedJob({
    id: "job-1",
    project: "ppl",
    platform: "ios",
    repo_url: "git@github.com:example/app.git",
    git_ref: "main",
    app_path: "apps/mobile",
    profile: "production",
    submit: "testflight",
    status: "leased",
    runner_id: "runner-1",
    created_at: "2026-07-12T10:00:00.000Z",
    updated_at: "2026-07-12T10:01:00.000Z",
    leased_at: "2026-07-12T10:01:00.000Z",
    finished_at: null,
  });

  assert.equal(job.repoUrl, "git@github.com:example/app.git");
  assert.equal(job.gitRef, "main");
  assert.equal(job.appPath, "apps/mobile");
  assert.equal(job.submit, "testflight");
  assert.deepEqual(job.checks, []);
});

test("hostedEventBody sends log lines and statuses in the hosted event shape", () => {
  assert.deepEqual(hostedEventBody({ type: "log.line", step: "build", line: "hello" }), {
    eventType: "log.line",
    step: "build",
    message: "hello",
    status: undefined,
    exitCode: undefined,
  });

  assert.deepEqual(hostedEventBody({ type: "job.finished", status: "failed", summary: "Build failed" }), {
    eventType: "job.finished",
    step: undefined,
    message: "Build failed",
    status: "failed",
    exitCode: undefined,
  });
});

test("createHostedRunnerClient reports HTTP registration failures without retrying them as connection failures", async () => {
  let requests = 0;
  const server = createServer((request, response) => {
    requests += 1;
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/api/runners");
    response.writeHead(402, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "Runner billing required after 1 runner included" }));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");

  try {
    await assert.rejects(
      createHostedRunnerClient({
        serviceUrl: `http://127.0.0.1:${address.port}`,
        apiKey: "facto_test",
        runnerName: "Stuart's MBP",
      }),
      /Facto service request failed: POST \/api\/runners returned HTTP 402\. Runner billing required after 1 runner included/
    );
    assert.equal(requests, 1);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
