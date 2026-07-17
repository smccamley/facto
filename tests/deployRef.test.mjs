import assert from "node:assert/strict";
import test from "node:test";
import { resolveDeployGitRef } from "../dist/cli/deployRef.js";

const fakeGit = (responses) => (args) => responses[args.join(" ")] ?? "";

test("deploy ref resolves explicit refs to pushed commits", () => {
  const sha = "f6a1430488ac300f115e265a8bd5a70f23f7d221";

  assert.equal(
    resolveDeployGitRef({
      configuredRef: "main",
      explicitRef: "release/ios",
      preferCurrentCommit: true,
      git: fakeGit({
        "rev-parse --verify release/ios^{commit}": sha,
        "fetch --quiet origin": "",
        [`branch -r --contains ${sha}`]: "  origin/release/ios\n",
      }),
    }),
    sha
  );
});

test("deploy ref pins the current pushed commit by default", () => {
  const sha = "f6a1430488ac300f115e265a8bd5a70f23f7d221";

  assert.equal(
    resolveDeployGitRef({
      configuredRef: "main",
      preferCurrentCommit: true,
      git: fakeGit({
        "rev-parse --verify HEAD^{commit}": sha,
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
        preferCurrentCommit: true,
        git: fakeGit({
          "rev-parse --verify HEAD^{commit}": sha,
          "fetch --quiet origin": "",
          [`branch -r --contains ${sha}`]: "",
        }),
      }),
    /Commit f6a1430488ac from HEAD is not available on origin/
  );
});

test("build resolves the configured ref to a pushed commit", () => {
  const sha = "1b2f430488ac300f115e265a8bd5a70f23f7d999";

  assert.equal(
    resolveDeployGitRef({
      configuredRef: "main",
      preferCurrentCommit: false,
      git: fakeGit({
        "rev-parse --verify main^{commit}": sha,
        "fetch --quiet origin": "",
        [`branch -r --contains ${sha}`]: "  origin/main\n",
      }),
    }),
    sha
  );
});

test("build fails when the configured ref cannot resolve to a commit", () => {
  assert.throws(
    () =>
      resolveDeployGitRef({
        configuredRef: "main",
        preferCurrentCommit: false,
        git: fakeGit({}),
      }),
    /Could not resolve Git ref main to a full commit SHA/
  );
});
