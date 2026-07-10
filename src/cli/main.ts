#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { loadFactoEnv } from "../shared/envFile.js";
import type { CreateJobInput, SubmitTarget } from "../shared/jobTypes.js";

loadFactoEnv([".facto/controller.env"]);

type CliOptions = Record<string, string | boolean>;

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
  if (!existsSync("facto.yml")) {
    return {};
  }

  return parseYaml(readFileSync("facto.yml", "utf8")) as Record<string, unknown>;
};

const requireValue = (value: string | undefined, name: string) => {
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
};

const toSubmitTarget = (value: string | undefined): SubmitTarget => (value === "testflight" ? "testflight" : "none");

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
    submit: toSubmitTarget(getOption(options, "submit")),
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

const main = async () => {
  const { positional, options } = parseArgs(process.argv.slice(2));

  if (positional[0] !== "build" || positional[1] !== "ios") {
    throw new Error("Usage: facto build ios --project NAME --repo URL --ref main --path packages/app --profile production");
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
