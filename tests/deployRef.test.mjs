import assert from "node:assert/strict";
import test from "node:test";
import { resolveDeployGitRef } from "../dist/cli/deployRef.js";

const fakeGit = (responses) => (args) => responses[args.join(" ")] ?? "";

test("deploy ref uses explicit ref without git inspection", () => {
  assert.equal(
    resolveDeployGitRef({
      configuredRef: "main",
      explicitRef: "release/ios",
      inferCurrentCommit: true,
      git: () => {
        throw new Error("git should not run");
      },
    }),
    "release/ios"
  );
});

test("deploy ref pins the current pushed commit by default", () => {
  const sha = "f6a1430488ac300f115e265a8bd5a70f23f7d221";

  assert.equal(
    resolveDeployGitRef({
      configuredRef: "main",
      inferCurrentCommit: true,
      git: fakeGit({
        "rev-parse --verify HEAD": sha,
        "fetch --quiet origin": "",
        [`branch -r --contains ${sha}`]: "  origin/main\n",
      }),
    }),
    sha
  );
});

test("deploy ref fails before queueing when current commit is not on origin", () => {
  const sha = "f6a1430488ac300f115e265a8bd5a70f23f7d221";

  assert.throws(
    () =>
      resolveDeployGitRef({
        configuredRef: "main",
        inferCurrentCommit: true,
        git: fakeGit({
          "rev-parse --verify HEAD": sha,
          "fetch --quiet origin": "",
          [`branch -r --contains ${sha}`]: "",
        }),
      }),
    /Commit f6a1430488ac is not available on origin/
  );
});

test("build ios keeps configured ref instead of inferring local commit", () => {
  assert.equal(
    resolveDeployGitRef({
      configuredRef: "main",
      inferCurrentCommit: false,
      git: () => {
        throw new Error("git should not run");
      },
    }),
    "main"
  );
});
