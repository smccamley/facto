import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type RunnerPreflightOptions = {
  verbose?: boolean;
};

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const envFlagEnabled = (value: string | undefined) => value === "1" || value === "true" || value === "yes";

const envFlagDisabled = (value: string | undefined) => value === "0" || value === "false" || value === "no";

export const runRunnerPreflight = (options: RunnerPreflightOptions = {}) => {
  if (envFlagEnabled(process.env.FACTO_SKIP_RUNNER_PREFLIGHT) || envFlagDisabled(process.env.FACTO_RUNNER_PREFLIGHT)) {
    if (options.verbose) {
      console.log("Runner preflight skipped by environment.");
    }

    return;
  }

  const scriptPath = join(packageRoot, "scripts", "preflight-runner-macos.sh");
  const manifestPath = process.env.FACTO_RUNNER_TOOLCHAIN_MANIFEST ?? join(packageRoot, "docs", "runner-toolchain.md");

  if (!existsSync(scriptPath)) {
    throw new Error(`Runner preflight script is missing: ${scriptPath}`);
  }

  if (!existsSync(manifestPath)) {
    throw new Error(`Runner toolchain manifest is missing: ${manifestPath}`);
  }

  const args = [scriptPath, "--manifest", manifestPath];

  if (options.verbose || envFlagEnabled(process.env.FACTO_VERBOSE)) {
    args.push("--verbose");
  }

  const result = spawnSync("bash", args, {
    cwd: packageRoot,
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    throw new Error(`Could not start runner preflight with bash: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`Runner preflight failed with exit code ${result.status ?? 1}. Review the preflight output above, fix the missing tool, then start the runner again.`);
  }
};
