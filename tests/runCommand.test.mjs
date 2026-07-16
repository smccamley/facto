import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runCommand } from "../dist/worker/runCommand.js";

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
