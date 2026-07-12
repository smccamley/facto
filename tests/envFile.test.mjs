import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadFactoEnv } from "../dist/shared/envFile.js";

test("loadFactoEnv loads unquoted and quoted values without overriding existing env", () => {
  const dir = mkdtempSync(join(tmpdir(), "facto-env-"));
  const envPath = join(dir, "test.env");
  const oldEnvFile = process.env.FACTO_ENV_FILE;
  const oldLoaded = process.env.FACTO_TEST_LOADED;
  const oldExisting = process.env.FACTO_TEST_EXISTING;

  try {
    writeFileSync(
      envPath,
      [
        "FACTO_TEST_LOADED=from-file",
        "FACTO_TEST_EXISTING=from-file",
        "FACTO_TEST_QUOTED='quoted value'",
      ].join("\n")
    );

    process.env.FACTO_ENV_FILE = envPath;
    process.env.FACTO_TEST_EXISTING = "already-set";
    delete process.env.FACTO_TEST_LOADED;
    delete process.env.FACTO_TEST_QUOTED;

    loadFactoEnv([]);

    assert.equal(process.env.FACTO_TEST_LOADED, "from-file");
    assert.equal(process.env.FACTO_TEST_EXISTING, "already-set");
    assert.equal(process.env.FACTO_TEST_QUOTED, "quoted value");
  } finally {
    if (oldEnvFile === undefined) {
      delete process.env.FACTO_ENV_FILE;
    } else {
      process.env.FACTO_ENV_FILE = oldEnvFile;
    }

    if (oldLoaded === undefined) {
      delete process.env.FACTO_TEST_LOADED;
    } else {
      process.env.FACTO_TEST_LOADED = oldLoaded;
    }

    if (oldExisting === undefined) {
      delete process.env.FACTO_TEST_EXISTING;
    } else {
      process.env.FACTO_TEST_EXISTING = oldExisting;
    }

    delete process.env.FACTO_TEST_QUOTED;
    rmSync(dir, { recursive: true, force: true });
  }
});
