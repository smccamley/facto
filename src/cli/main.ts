#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { hostname } from "node:os";
import { basename, relative, sep } from "node:path";
import { loadFactoEnv } from "../shared/envFile.js";
import type { CreateJobInput } from "../shared/jobTypes.js";
import { resolveDeployGitRef } from "./deployRef.js";
import { setupProject } from "./projectSetup.js";
import { runJob } from "../worker/runJob.js";
import type { ControllerClient } from "../worker/controllerClient.js";
import { createHostedRunnerClient, isRunnerKillRequestedError } from "../worker/hostedClient.js";
import { runRunnerPreflight } from "../worker/preflight.js";
import { formatRunnerError } from "../worker/runnerErrors.js";

loadFactoEnv([".facto/controller.env"]);

type CliOptions = Record<string, string | boolean>;

type HostedJobEvent = {
  id: string;
  event_type: string;
  step: string | null;
  message: string | null;
  created_at: string;
};

const hostedControllerUrl = "https://expofacto.dev";
const expofactoConfigPath = "expofacto.json";

const assertSupportedNode = () => {
  const major = Number(process.versions.node.split(".")[0]);

  if (major < 24) {
    throw new Error(`Expo Facto requires Node.js 24 or newer. Current Node.js is ${process.version}.`);
  }
};

const parseArgs = (args: string[]) => {
  const positional: string[] = [];
  const options: CliOptions = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "-V") {
      options.verbose = true;
      continue;
    }

    if (arg === "-h") {
      options.help = true;
      continue;
    }

    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }

    const [key, inlineValue] = arg.slice(2).split("=", 2);

    if (inlineValue !== undefined) {
      options[key] = inlineValue;
      continue;
    }

    const next = args[index + 1];

    if (!next || next.startsWith("--")) {
      options[key] = true;
      continue;
    }

    options[key] = next;
    index += 1;
  }

  return { positional, options };
};

const getOption = (options: CliOptions, key: string) => {
  const value = options[key];
  return typeof value === "string" ? value : undefined;
};

const getBooleanOption = (options: CliOptions, key: string) => options[key] === true;

const getApiKey = (options: CliOptions) => {
  const apiKey = getOption(options, "api-key") ?? process.env.EXPOFACTO_API_KEY;
  return apiKey?.trim() ? apiKey : undefined;
};

const getControllerUrl = (options: CliOptions) => getOption(options, "controller-url") ?? hostedControllerUrl;

const assertSupportedOptions = (options: CliOptions, allowed: string[]) => {
  const allowedOptions = new Set(allowed);
  const unsupported = Object.keys(options).filter((key) => !allowedOptions.has(key));

  if (unsupported.length > 0) {
    throw new Error(`Unsupported option --${unsupported[0]}`);
  }
};

const usage = `Usage: expofacto setup | expofacto deploy | expofacto build --platform ios | expofacto start runner [-V|--verbose]

Commands:
  setup                 Create local secret templates and package scripts
  deploy                Queue an iOS build for the current pushed commit
  build                 Queue a build using EAS-style flags
  logs <job-id>         Print hosted build events and logs
  start runner          Register this Mac as a hosted iOS runner
`;

const requireValue = (value: string | undefined, name: string) => {
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
};

type PackageJson = {
  name?: string;
};

type ExpofactoConfig = {
  build?: {
    ios?: {
      prebuild?: unknown;
    };
  };
};

const readPackageJson = (): PackageJson => {
  if (!existsSync("package.json")) {
    return {};
  }

  return JSON.parse(readFileSync("package.json", "utf8")) as PackageJson;
};

const readExpofactoConfig = (): ExpofactoConfig => {
  if (!existsSync(expofactoConfigPath)) {
    return {};
  }

  return JSON.parse(readFileSync(expofactoConfigPath, "utf8")) as ExpofactoConfig;
};

const runGit = (args: string[]) => {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
};

const sleep = async (milliseconds: number) => {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
};

const remoteKillError = () => new Error("Runner was killed remotely");

const watchRunnerKill = (client: ControllerClient, abortController: AbortController) => {
  let stopped = false;

  const watch = async () => {
    while (!stopped && !abortController.signal.aborted) {
      const command = await client.checkRunnerCommand?.();

      if (command?.type === "kill") {
        abortController.abort(remoteKillError());
        return;
      }

      await sleep(2_000);
    }
  };

  void watch().catch((error) => {
    abortController.abort(error instanceof Error ? error : remoteKillError());
  });

  return () => {
    stopped = true;
  };
};

const acknowledgeRunnerKill = async (client: ControllerClient) => {
  await client.acknowledgeRunnerKill?.();
  console.log("Runner was killed remotely; exiting.");
};

const getPlatform = (options: CliOptions): "ios" => {
  const platform = getOption(options, "platform") ?? "ios";

  if (platform !== "ios") {
    throw new Error("Expo Facto currently supports --platform ios");
  }

  return platform;
};

const projectNameFromPackage = (packageJson: PackageJson) => {
  return packageJson.name?.replace(/^@[^/]+\//, "") || basename(process.cwd());
};

const inferAppPath = () => {
  const gitRoot = runGit(["rev-parse", "--show-toplevel"]);

  if (!gitRoot) {
    return ".";
  }

  const appPath = relative(gitRoot, process.cwd()) || ".";
  return appPath.split(sep).join("/");
};

const prebuildChecks = (config: ExpofactoConfig) => {
  const prebuild = config.build?.ios?.prebuild;

  if (prebuild === undefined) {
    return undefined;
  }

  if (!Array.isArray(prebuild) || prebuild.some((command) => typeof command !== "string" || !command.trim())) {
    throw new Error(`${expofactoConfigPath} build.ios.prebuild must be an array of commands`);
  }

  return prebuild;
};

const createJobInput = (options: CliOptions): CreateJobInput => {
  const packageJson = readPackageJson();
  const expofactoConfig = readExpofactoConfig();
  const repoUrl = requireValue(runGit(["remote", "get-url", "origin"]), "git origin remote");

  return {
    project: projectNameFromPackage(packageJson),
    platform: getPlatform(options),
    repoUrl,
    gitRef: resolveDeployGitRef({
      configuredRef: "HEAD",
      preferCurrentCommit: true,
    }),
    appPath: inferAppPath(),
    profile: getOption(options, "profile") ?? "production",
    submit: getBooleanOption(options, "auto-submit") ? "testflight" : "none",
    checks: prebuildChecks(expofactoConfig),
    triggerSource: "cli",
  };
};

const postJob = async (controllerUrl: string, apiKey: string, input: CreateJobInput) => {
  const response = await fetch(`${controllerUrl.replace(/\/$/, "")}/api/jobs`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`Job creation failed with ${response.status}: ${await response.text()}`);
  }

  return (await response.json()) as { job: { id: string }; url: string; warning?: string | null };
};

const fetchJobLogs = async (controllerUrl: string, apiKey: string, jobId: string) => {
  const response = await fetch(`${controllerUrl.replace(/\/$/, "")}/api/jobs/${jobId}/events`, {
    headers: {
      authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Log fetch failed with ${response.status}: ${await response.text()}`);
  }

  return (await response.json()) as { events: HostedJobEvent[] };
};

export const formatJobEventLine = (event: HostedJobEvent) => {
  const step = event.step ? `${event.step}: ` : "";
  const message = event.message ?? "";
  return `${event.created_at} ${event.event_type} ${step}${message}`.trim();
};

const startHostedRunner = async (options: CliOptions) => {
  const apiKey = requireValue(getOption(options, "api-key") ?? process.env.EXPOFACTO_API_KEY, "api-key");
  const serviceUrl = getOption(options, "service-url") ?? getOption(options, "url") ?? hostedControllerUrl;
  const runnerName = getOption(options, "name") ?? process.env.FACTO_RUNNER_NAME ?? hostname();
  const workspaceRoot = getOption(options, "workspace") ?? process.env.FACTO_WORKSPACE_ROOT ?? ".facto-runner/workspaces";
  const pollIntervalMs = Number(getOption(options, "poll-interval-ms") ?? process.env.FACTO_POLL_INTERVAL_MS ?? 5000);
  const verbose = getBooleanOption(options, "verbose") || process.env.FACTO_VERBOSE === "1";

  runRunnerPreflight({ verbose });

  const { runner, client } = await createHostedRunnerClient({ serviceUrl, apiKey, runnerName });

  console.log(`Facto runner ${runner.name} polling ${serviceUrl}`);

  while (true) {
    let job;

    try {
      job = await client.leaseJob();
    } catch (error) {
      if (isRunnerKillRequestedError(error)) {
        await acknowledgeRunnerKill(client);
        return;
      }

      throw error;
    }

    if (job) {
      const abortController = new AbortController();
      const stopWatchingKill = watchRunnerKill(client, abortController);

      try {
        await runJob(client, job, workspaceRoot, { verbose, signal: abortController.signal });
      } catch (error) {
        if (abortController.signal.aborted) {
          await acknowledgeRunnerKill(client);
          return;
        }

        throw error;
      } finally {
        stopWatchingKill();
      }
    } else if (verbose) {
      console.log(`No job available; polling again in ${pollIntervalMs}ms`);
    }

    await sleep(pollIntervalMs);
  }
};

const main = async () => {
  assertSupportedNode();
  const { positional, options } = parseArgs(process.argv.slice(2));
  const command = positional[0];

  if (getBooleanOption(options, "help") || command === "help") {
    console.log(usage);
    return;
  }

  if (command === "setup") {
    const result = setupProject();

    for (const path of result.created) {
      console.log(`created ${path}`);
    }

    for (const path of result.updated) {
      console.log(`updated ${path}`);
    }

    console.log("deploy with npm run deploy or expofacto deploy");
    return;
  }

  if (command === "start" && (positional[1] === "runner" || positional[1] === "worker")) {
    await startHostedRunner(options);
    return;
  }

  if (command === "logs") {
    const jobId = requireValue(positional[1], "job-id");
    const controllerUrl = getControllerUrl(options);
    const apiKey = requireValue(getApiKey(options), "api-key or EXPOFACTO_API_KEY");
    const result = await fetchJobLogs(controllerUrl, apiKey, jobId);

    for (const event of result.events) {
      console.log(formatJobEventLine(event));
    }

    return;
  }

  if (command === "build" && positional.length > 1) {
    throw new Error("Use expofacto build --platform ios instead of expofacto build ios");
  }

  if (command !== "deploy" && command !== "build") {
    throw new Error(usage.trim());
  }

  assertSupportedOptions(options, ["api-key", "controller-url", "platform", "profile", "auto-submit"]);

  const controllerUrl = getControllerUrl(options);
  const apiKey = requireValue(getApiKey(options), "api-key or EXPOFACTO_API_KEY");
  const result = await postJob(controllerUrl, apiKey, createJobInput(options));
  console.log(`${controllerUrl.replace(/\/$/, "")}/api/jobs/${result.job.id}`);

  if (result.warning) {
    console.warn(result.warning);
  }
};

main().catch((error) => {
  console.error(formatRunnerError(error));
  process.exit(1);
});
