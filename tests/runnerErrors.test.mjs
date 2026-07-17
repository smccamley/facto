import assert from "node:assert/strict";
import test from "node:test";
import { formatHttpError, formatRequestFailure, formatRunnerError } from "../dist/worker/runnerErrors.js";

test("formatRunnerError returns a plain message without a stack trace", () => {
  assert.equal(formatRunnerError(new Error("EXPOFACTO_API_KEY is required")), "EXPOFACTO_API_KEY is required");
  assert.equal(formatRunnerError("plain failure"), "plain failure");
  assert.equal(formatRunnerError({ unexpected: true }), "Unknown runner error");
});

test("formatHttpError explains service failures with method, path, status, and body", async () => {
  const message = await formatHttpError(new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }), {
    method: "POST",
    url: "https://expofacto.dev/api/runners",
  });

  assert.equal(message, "Facto service request failed: POST /api/runners returned HTTP 401. Unauthorized");
});

test("formatRequestFailure explains connection failures after retries", () => {
  assert.equal(
    formatRequestFailure(new Error("fetch failed"), {
      method: "POST",
      url: "localhost:3000/api/runners",
      attempts: 3,
    }),
    "Facto service request failed: POST localhost:3000/api/runners could not connect after 3 attempts. fetch failed"
  );
});
