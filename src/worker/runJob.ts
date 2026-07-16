import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import type { BuildJob } from "../shared/jobTypes.js";
import type { ControllerClient } from "./controllerClient.js";
import { runCommand } from "./runCommand.js";

type RunJobOptions = {
  signal?: AbortSignal;
  verbose?: boolean;
};

export type ToolchainCheck = {
  name: string;
  command: string;
  args: string[];
  hint: string;
};

const commandForShell = (command: string) => {
  const [name, ...args] = command.split(" ").filter(Boolean);
  return { name, args };
};

export const easBuildArgs = (job: Pick<BuildJob, "profile">, artifactPath: string, options: { verbose?: boolean } = {}) => [
  "--yes",
  "--package",
  "eas-cli@latest",
  "eas",
  "build",
  "--platform",
  "ios",
  "--profile",
  job.profile,
  "--local",
  "--output",
  artifactPath,
  "--non-interactive",
  "--freeze-credentials",
  ...(options.verbose ? ["--verbose-logs"] : []),
];

export const easSubmitArgs = (job: Pick<BuildJob, "profile">, artifactPath: string) => [
  "--yes",
  "--package",
  "eas-cli@latest",
  "eas",
  "submit",
  "--platform",
  "ios",
  "--profile",
  job.profile,
  "--path",
  artifactPath,
  "--non-interactive",
];

export const jobToolchainChecks = (): ToolchainCheck[] => [
  {
    name: "Git",
    command: "git",
    args: ["--version"],
    hint: "Install Git and make sure it is on PATH before starting the runner.",
  },
  {
    name: "npm",
    command: "npm",
    args: ["--version"],
    hint: "Install Node.js with npm and make sure npm is on PATH before starting the runner.",
  },
  {
    name: "npx",
    command: "npx",
    args: ["--version"],
    hint: "Install Node.js with npx and make sure npx is on PATH before starting the runner.",
  },
  {
    name: "EAS CLI package mode",
    command: "npx",
    args: ["--yes", "--package", "eas-cli@latest", "eas", "--version"],
    hint: "Make sure npx can install and run eas-cli@latest; check network access and npm registry authentication.",
  },
];

const validateJobToolchain = async (client: ControllerClient, job: BuildJob, cwd: string, options: RunJobOptions = {}) => {
  const step = "preflight";

  await client.sendEvent(job.id, { type: "step.started", step });

  try {
    for (const check of jobToolchainChecks()) {
      await logLine(client, job, step, `Checking ${check.name}`);

      try {
        execFileSync(check.command, check.args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      } catch {
        throw new Error(`${check.name} is required before running a job. ${check.hint}`);
      }
    }

    await client.sendEvent(job.id, { type: "step.finished", step, status: "complete", exitCode: 0 });
  } catch (error) {
    const summary = error instanceof Error ? error.message : "Runner toolchain validation failed.";

    await logLine(client, job, step, summary);
    await client.sendEvent(job.id, { type: "step.finished", step, status: "failed", exitCode: 1 });
    throw new Error(summary);
  }
};

const runStep = async (
  client: ControllerClient,
  job: BuildJob,
  step: string,
  cwd: string,
  command: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
  options: RunJobOptions = {},
  stepOptions: { reportFailure?: boolean } = {}
) => {
  if (options.signal?.aborted) {
    throw options.signal.reason instanceof Error ? options.signal.reason : new Error("Runner was killed remotely");
  }

  const latestJob = await client.getJob(job.id);

  if (latestJob?.status === "cancelled") {
    throw new Error("Job was cancelled");
  }

  await client.sendEvent(job.id, { type: "step.started", step });
  const exitCode = await runCommand({ jobId: job.id, step, command, args, cwd, env, client, verbose: options.verbose, signal: options.signal });
  const status = exitCode === 0 ? "complete" : "failed";

  if (exitCode !== 0) {
    if (stepOptions.reportFailure !== false) {
      await client.sendEvent(job.id, { type: "step.finished", step, status, exitCode });
    }

    throw new Error(`${step} failed with exit code ${exitCode}`);
  }

  await client.sendEvent(job.id, { type: "step.finished", step, status, exitCode });
};

const logLine = async (client: ControllerClient, job: BuildJob, step: string, line: string) => {
  await client.sendEvent(job.id, { type: "log.line", step, line });
};

const checkoutAttempt = async (client: ControllerClient, job: BuildJob, repoPath: string, options: RunJobOptions = {}) => {
  const parentPath = resolve(repoPath, "..");
  mkdirSync(parentPath, { recursive: true });

  if (!existsSync(join(repoPath, ".git"))) {
    await runStep(client, job, "checkout", parentPath, "git", ["clone", job.repoUrl, repoPath], undefined, options, { reportFailure: false });
  } else {
    await runStep(client, job, "checkout", repoPath, "git", ["fetch", "--prune", "origin"], undefined, options, { reportFailure: false });
  }

  await runStep(client, job, "checkout", repoPath, "git", ["checkout", "--force", job.gitRef], undefined, options, { reportFailure: false });
  await runStep(client, job, "checkout", repoPath, "git", ["reset", "--hard", job.gitRef], undefined, options, { reportFailure: false });
  await runStep(client, job, "checkout", repoPath, "git", ["clean", "-ffdx"], undefined, options, { reportFailure: false });
};

const checkoutRepo = async (client: ControllerClient, job: BuildJob, repoPath: string, options: RunJobOptions = {}) => {
  try {
    await checkoutAttempt(client, job, repoPath, options);
  } catch (error) {
    if (options.signal?.aborted || (error instanceof Error && error.message === "Job was cancelled")) {
      throw error;
    }

    await logLine(client, job, "checkout", `Checkout repair failed; recloning workspace. ${error instanceof Error ? error.message : ""}`.trim());
    rmSync(repoPath, { recursive: true, force: true });
    await checkoutAttempt(client, job, repoPath, options);
  }
};

const getCommitSha = async (client: ControllerClient, job: BuildJob, repoPath: string) => {
  const commitSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoPath, encoding: "utf8" }).trim();
  await client.sendEvent(job.id, { type: "log.line", step: "checkout", line: `Commit ${commitSha}` });
  return commitSha;
};

export const runJob = async (client: ControllerClient, job: BuildJob, workspaceRoot: string, options: RunJobOptions = {}) => {
  const repoPath = join(workspaceRoot, job.project, "repo");
  const artifactPath = join(repoPath, job.appPath, ".facto", "artifacts", `${job.project}.ipa`);
  const appPath = join(repoPath, job.appPath);
  try {
    if (options.verbose) {
      console.log(`[${job.id}] leased ${job.project} ${job.gitRef}`);
    }

    mkdirSync(workspaceRoot, { recursive: true });
    await validateJobToolchain(client, job, workspaceRoot, options);
    await checkoutRepo(client, job, repoPath, options);
    const commitSha = await getCommitSha(client, job, repoPath);
    await logLine(client, job, "diagnostics", `cwd ${appPath}`);
    await runStep(client, job, "install", appPath, "npm", ["ci"], undefined, options);

    for (const check of job.checks) {
      const { name, args } = commandForShell(check);
      await runStep(client, job, "check", appPath, name, args, undefined, options);
    }

    await runStep(client, job, "prebuild", appPath, "npx", ["expo", "prebuild", "--platform", "ios"], { CI: "1" }, options);
    mkdirSync(dirname(artifactPath), { recursive: true });
    await runStep(client, job, "build", appPath, "npx", easBuildArgs(job, artifactPath, { verbose: options.verbose }), undefined, options);

    if (existsSync(artifactPath)) {
      await client.registerArtifact(job.id, {
        kind: "ipa",
        path: artifactPath,
        sizeBytes: statSync(artifactPath).size,
      });
    }

    if (job.submit === "testflight") {
      await runStep(client, job, "submit", appPath, "npx", easSubmitArgs(job, artifactPath), undefined, options);
    }

    await client.sendEvent(job.id, { type: "job.finished", status: "complete", commitSha });
  } catch (error) {
    if (options.signal?.aborted) {
      throw error;
    }

    await client.sendEvent(job.id, {
      type: "job.finished",
      status: "failed",
      summary: error instanceof Error ? error.message : "Build failed",
    });
  }
};
