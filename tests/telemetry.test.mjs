import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { postBuildTelemetry } from "../dist/shared/telemetry.js";

test("build telemetry posts anonymizable build metadata without requiring auth", async () => {
  const requests = [];
  const oldUrl = process.env.EXPOFACTO_TELEMETRY_URL;
  const oldDisabled = process.env.EXPOFACTO_TELEMETRY_DISABLED;
  const server = createServer((request, response) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      requests.push({
        authorization: request.headers.authorization,
        body: JSON.parse(body),
        method: request.method,
        url: request.url,
      });
      response.writeHead(202, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");

  try {
    delete process.env.EXPOFACTO_TELEMETRY_DISABLED;
    process.env.EXPOFACTO_TELEMETRY_URL = `http://127.0.0.1:${address.port}/api/telemetry/builds`;

    await postBuildTelemetry({
      command: "build",
      eventType: "build.triggered",
      jobId: "job-1",
      source: "cli",
    });

    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, "POST");
    assert.equal(requests[0].url, "/api/telemetry/builds");
    assert.equal(requests[0].authorization, undefined);
    assert.equal(requests[0].body.command, "build");
    assert.equal(requests[0].body.eventType, "build.triggered");
    assert.equal(requests[0].body.jobId, "job-1");
    assert.equal(requests[0].body.source, "cli");
    assert.equal(typeof requests[0].body.packageVersion, "string");
  } finally {
    if (oldUrl === undefined) {
      delete process.env.EXPOFACTO_TELEMETRY_URL;
    } else {
      process.env.EXPOFACTO_TELEMETRY_URL = oldUrl;
    }

    if (oldDisabled === undefined) {
      delete process.env.EXPOFACTO_TELEMETRY_DISABLED;
    } else {
      process.env.EXPOFACTO_TELEMETRY_DISABLED = oldDisabled;
    }

    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
