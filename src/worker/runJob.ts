import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import type { BuildJob } from "../shared/jobTypes.js";
import { postBuildTelemetry } from "../shared/telemetry.js";
import type { ControllerClient } from "./controllerClient.js";
import { runCommand } from "./runCommand.js";

type RunJobOptions = {
  signal?: AbortSignal;
  verbose?: boolean;
};

type EasBuildProfile = Record<string, unknown> & {
  developmentClient?: unknown;
  distribution?: unknown;
  environment?: unknown;
  extends?: unknown;
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
  "submit",
  "--platform",
  "ios",
  "--profile",
  job.profile,
  "--path",
  artifactPath,
  "--non-interactive",
];

const easEnvPullArgs = (environment: string, path: string) => [
  "env:pull",
  "--environment",
  environment,
  "--path",
  path,
  "--non-interactive",
];

export const easCliInstallArgs = (toolPath: string) => ["install", "--prefix", toolPath, "--no-save", "--no-package-lock", "eas-cli@latest"];

export const easCliBinPath = (toolPath: string) => join(toolPath, "node_modules", ".bin", process.platform === "win32" ? "eas.cmd" : "eas");

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
    name: "EAS CLI package",
    command: "npm",
    args: ["view", "eas-cli", "version"],
    hint: "Make sure npm can resolve eas-cli from the configured registry before running jobs.",
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

const parseEnvValue = (value: string) => {
  const trimmed = value.trim();

  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
};

const parseEnvFile = (path: string) => {
  if (!existsSync(path)) {
    return {};
  }

  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const equalsIndex = line.indexOf("=");
        return [line.slice(0, equalsIndex).trim(), parseEnvValue(line.slice(equalsIndex + 1))];
      })
  ) as NodeJS.ProcessEnv;
};

const profileRecord = (value: unknown): EasBuildProfile => {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as EasBuildProfile) : {};
};

const mergeProfiles = (base: EasBuildProfile, child: EasBuildProfile): EasBuildProfile => {
  return { ...base, ...child };
};

const resolveBuildProfile = (profiles: Record<string, unknown>, profileName: string, seen: string[] = []): EasBuildProfile => {
  if (seen.includes(profileName)) {
    throw new Error(`Circular eas.json build profile extends chain: ${[...seen, profileName].join(" -> ")}`);
  }

  const profile = profileRecord(profiles[profileName]);

  if (typeof profile.extends !== "string") {
    return profile;
  }

  return mergeProfiles(resolveBuildProfile(profiles, profile.extends, [...seen, profileName]), profile);
};

export const resolveEasEnvironment = (appPath: string, profileName: string) => {
  const easJsonPath = join(appPath, "eas.json");

  if (!existsSync(easJsonPath)) {
    return profileName === "development" || profileName === "preview" ? profileName : "production";
  }

  const easJson = JSON.parse(readFileSync(easJsonPath, "utf8")) as { build?: Record<string, unknown> };
  const profile = resolveBuildProfile(easJson.build ?? {}, profileName);

  if (typeof profile.environment === "string" && profile.environment.trim()) {
    return profile.environment.trim();
  }

  if (profile.developmentClient === true) {
    return "development";
  }

  if (profile.distribution === "internal" || profile.distribution === "simulator") {
    return "preview";
  }

  if (profileName === "development" || profileName === "preview") {
    return profileName;
  }

  return "production";
};

const loadEasEnvironment = async (client: ControllerClient, job: BuildJob, appPath: string, easCommand: string, options: RunJobOptions = {}) => {
  const environment = resolveEasEnvironment(appPath, job.profile);
  const envPath = join(appPath, ".facto", "eas-env");

  mkdirSync(dirname(envPath), { recursive: true });
  await runStep(client, job, "environment", appPath, easCommand, easEnvPullArgs(environment, envPath), job.env, options);

  const env = parseEnvFile(envPath);
  await logLine(client, job, "environment", `Loaded readable EAS environment variables for ${environment}`);
  return env;
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
  const easToolPath = join(appPath, ".facto", "tools", "eas-cli");
  const easCommand = easCliBinPath(easToolPath);
  try {
    if (options.verbose) {
      console.log(`[${job.id}] leased ${job.project} ${job.gitRef}`);
    }

    void postBuildTelemetry({
      eventType: "build.runner_started",
      jobId: job.id,
      source: "runner",
    });
    mkdirSync(workspaceRoot, { recursive: true });
    await validateJobToolchain(client, job, workspaceRoot, options);
    await checkoutRepo(client, job, repoPath, options);
    const commitSha = await getCommitSha(client, job, repoPath);
    await logLine(client, job, "diagnostics", `cwd ${appPath}`);
    await runStep(client, job, "install", appPath, "npm", ["ci"], job.env, options);
    await runStep(client, job, "tooling", appPath, "npm", easCliInstallArgs(easToolPath), job.env, options);
    const easEnv = { ...job.env, ...(await loadEasEnvironment(client, job, appPath, easCommand, options)) };

    for (const check of job.checks) {
      const { name, args } = commandForShell(check);
      await runStep(client, job, "check", appPath, name, args, easEnv, options);
    }

    await runStep(client, job, "prebuild", appPath, "npx", ["expo", "prebuild", "--platform", "ios"], { ...easEnv, CI: "1" }, options);
    mkdirSync(dirname(artifactPath), { recursive: true });
    await runStep(client, job, "build", appPath, easCommand, easBuildArgs(job, artifactPath, { verbose: options.verbose }), easEnv, options);

    if (existsSync(artifactPath)) {
      await client.registerArtifact(job.id, {
        kind: "ipa",
        path: artifactPath,
        sizeBytes: statSync(artifactPath).size,
      });
    }

    if (job.submit === "testflight") {
      await runStep(client, job, "submit", appPath, easCommand, easSubmitArgs(job, artifactPath), easEnv, options);
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
