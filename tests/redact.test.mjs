import assert from "node:assert/strict";
import test from "node:test";
import { createRedactor } from "../dist/worker/redact.js";

test("createRedactor hides known secrets and long token-like values", () => {
  const redact = createRedactor({
    EXPO_TOKEN: "expo-secret-token",
    NORMAL_VALUE: "visible",
  });

  const line = "token=expo-secret-token visible abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ123456";

  assert.equal(redact(line), "token=[redacted] visible [redacted-token]");
});
