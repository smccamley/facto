#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { hostname } from "node:os";
import { parse as parseYaml } from "yaml";
import { loadFactoEnv } from "../shared/envFile.js";
import type { CreateJobInput, SubmitTarget } from "../shared/jobTypes.js";
import { setupProject } from "./projectSetup.js";
import { runJob } from "../worker/runJob.js";
import { createHostedRunnerClient } from "../worker/hostedClient.js";

loadFactoEnv([".expofacto/secrets.env", ".facto/controller.env"]);

type CliOptions = Record<string, string | boolean>;

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

    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }

    const key = arg.slice(2);
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

const readFactoConfig = () => {
  const path = existsSync(".expofacto/config.yml") ? ".expofacto/config.yml" : "facto.yml";

  if (!existsSync(path)) {
    return {};
  }

  return parseYaml(readFileSync(path, "utf8")) as Record<string, unknown>;
};

const requireValue = (value: string | undefined, name: string) => {
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
};

const sleep = async (milliseconds: number) => {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
};

const toSubmitTarget = (value: string | undefined): SubmitTarget => (value === "testflight" ? "testflight" : "none");

const toChecks = (value: unknown) => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter((check): check is string => typeof check === "string");
};

const createJobInput = (options: CliOptions): CreateJobInput => {
  const config = readFactoConfig();
  const repo = (config.repo ?? {}) as Record<string, unknown>;
  const app = (config.app ?? {}) as Record<string, unknown>;
  const ios = (config.ios ?? {}) as Record<string, unknown>;

  return {
    project: requireValue(getOption(options, "project") ?? String(config.project ?? ""), "project"),
    platform: "ios",
    repoUrl: requireValue(getOption(options, "repo") ?? String(repo.url ?? ""), "repo"),
    gitRef: getOption(options, "ref") ?? String(repo.defaultRef ?? "main"),
    appPath: getOption(options, "path") ?? String(app.path ?? "."),
    profile: getOption(options, "profile") ?? String(ios.profile ?? "production"),
    submit: toSubmitTarget(getOption(options, "submit") ?? String(ios.submit ?? "")),
    checks: toChecks(config.checks),
    triggerSource: "cli",
  };
};

const postJob = async (controllerUrl: string, token: string, input: CreateJobInput) => {
  const response = await fetch(`${controllerUrl.replace(/\/$/, "")}/api/jobs`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`Job creation failed with ${response.status}: ${await response.text()}`);
  }

  return (await response.json()) as { job: { id: string }; url: string };
};

const startHostedRunner = async (options: CliOptions) => {
  const apiKey = requireValue(getOption(options, "api-key") ?? process.env.FACTO_API_KEY, "api-key");
  const serviceUrl = getOption(options, "service-url") ?? getOption(options, "url") ?? process.env.FACTO_SERVICE_URL ?? "https://expofacto.dev";
  const runnerName = getOption(options, "name") ?? process.env.FACTO_RUNNER_NAME ?? hostname();
  const workspaceRoot = getOption(options, "workspace") ?? process.env.FACTO_WORKSPACE_ROOT ?? ".facto-runner/workspaces";
  const pollIntervalMs = Number(getOption(options, "poll-interval-ms") ?? process.env.FACTO_POLL_INTERVAL_MS ?? 5000);
  const { runner, client } = await createHostedRunnerClient({ serviceUrl, apiKey, runnerName });

  console.log(`Facto runner ${runner.name} polling ${serviceUrl}`);

  while (true) {
    const job = await client.leaseJob();

    if (job) {
      await runJob(client, job, workspaceRoot);
    }

    await sleep(pollIntervalMs);
  }
};

const main = async () => {
  assertSupportedNode();
  const { positional, options } = parseArgs(process.argv.slice(2));
  const command = positional[0];

  if (command === "setup") {
    const result = setupProject();

    for (const path of result.created) {
      console.log(`created ${path}`);
    }

    for (const path of result.updated) {
      console.log(`updated ${path}`);
    }

    if (result.missing.length > 0) {
      console.log(`fill in ${result.missing.join(", ")} in .expofacto/secrets.env`);
    }

    console.log("deploy with npm run deploy or .expofacto/deploy.sh");
    return;
  }

  if (command === "start" && (positional[1] === "runner" || positional[1] === "worker")) {
    await startHostedRunner(options);
    return;
  }

  if (command !== "deploy" && (positional[0] !== "build" || positional[1] !== "ios")) {
    throw new Error("Usage: expofacto setup | expofacto deploy | expofacto build ios | expofacto start runner");
  }

  const controllerUrl = requireValue(getOption(options, "controller-url") ?? process.env.FACTO_CONTROLLER_URL, "controller-url");
  const token = requireValue(getOption(options, "token") ?? process.env.FACTO_API_TOKEN, "token");
  const result = await postJob(controllerUrl, token, createJobInput(options));
  console.log(`${controllerUrl.replace(/\/$/, "")}/api/jobs/${result.job.id}`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
