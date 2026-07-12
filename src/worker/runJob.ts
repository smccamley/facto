import { existsSync, mkdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import type { BuildJob } from "../shared/jobTypes.js";
import type { ControllerClient } from "./controllerClient.js";
import { runCommand } from "./runCommand.js";

type RunJobOptions = {
  signal?: AbortSignal;
  verbose?: boolean;
};

const commandForShell = (command: string) => {
  const [name, ...args] = command.split(" ").filter(Boolean);
  return { name, args };
};

const runStep = async (
  client: ControllerClient,
  job: BuildJob,
  step: string,
  cwd: string,
  command: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
  options: RunJobOptions = {}
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
  await client.sendEvent(job.id, { type: "step.finished", step, status, exitCode });

  if (exitCode !== 0) {
    throw new Error(`${step} failed with exit code ${exitCode}`);
  }
};

const checkoutRepo = async (client: ControllerClient, job: BuildJob, repoPath: string, options: RunJobOptions = {}) => {
  const parentPath = resolve(repoPath, "..");
  mkdirSync(parentPath, { recursive: true });

  if (!existsSync(join(repoPath, ".git"))) {
    await runStep(client, job, "checkout", parentPath, "git", ["clone", job.repoUrl, repoPath], undefined, options);
  } else {
    await runStep(client, job, "checkout", repoPath, "git", ["fetch", "--prune", "origin"], undefined, options);
  }

  await runStep(client, job, "checkout", repoPath, "git", ["checkout", "--force", job.gitRef], undefined, options);
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
  const easVerboseArgs = options.verbose ? ["--verbose"] : [];

  try {
    if (options.verbose) {
      console.log(`[${job.id}] leased ${job.project} ${job.gitRef}`);
    }

    await checkoutRepo(client, job, repoPath, options);
    const commitSha = await getCommitSha(client, job, repoPath);
    await runStep(client, job, "install", appPath, "npm", ["ci"], undefined, options);

    for (const check of job.checks) {
      const { name, args } = commandForShell(check);
      await runStep(client, job, "check", appPath, name, args, undefined, options);
    }

    await runStep(client, job, "prebuild", appPath, "npx", ["expo", "prebuild", "--platform", "ios"], { CI: "1" }, options);
    mkdirSync(dirname(artifactPath), { recursive: true });
    await runStep(client, job, "build", appPath, "npx", [
      "eas-cli@latest",
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
      ...easVerboseArgs,
    ], undefined, options);

    if (existsSync(artifactPath)) {
      await client.registerArtifact(job.id, {
        kind: "ipa",
        path: artifactPath,
        sizeBytes: statSync(artifactPath).size,
      });
    }

    if (job.submit === "testflight") {
      await runStep(client, job, "submit", appPath, "npx", [
        "eas-cli@latest",
        "submit",
        "--platform",
        "ios",
        "--profile",
        job.profile,
        "--path",
        artifactPath,
        "--non-interactive",
        ...easVerboseArgs,
      ], undefined, options);
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
