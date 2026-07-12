import { spawn } from "node:child_process";
import type { ControllerClient } from "./controllerClient.js";
import { createRedactor } from "./redact.js";

type RunCommandOptions = {
  jobId: string;
  step: string;
  command: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  client: ControllerClient;
  verbose?: boolean;
};

const splitLines = (text: string, previous: string) => {
  const lines = `${previous}${text}`.split(/\r?\n/);
  const nextPrevious = lines.pop() ?? "";
  return { lines, previous: nextPrevious };
};

const stepPrefix = (step: string) => `${step}: `;

export const runCommand = async (options: RunCommandOptions) => {
  const env = { ...process.env, ...options.env };
  const redact = createRedactor(env);
  let stdoutBuffer = "";
  let stderrBuffer = "";
  let sendQueue = Promise.resolve();
  const commandLine = redact(`$ ${options.command} ${options.args.join(" ")}`);

  await options.client.sendEvent(options.jobId, {
    type: "log.line",
    step: options.step,
    line: commandLine,
  });

  if (options.verbose) {
    console.log(`[${options.jobId}] ${options.step}: ${commandLine}`);
  }

  const child = spawn(options.command, options.args, {
    cwd: options.cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const sendLines = async (chunk: Buffer, streamName: "stdout" | "stderr") => {
    const buffer = streamName === "stdout" ? stdoutBuffer : stderrBuffer;
    const result = splitLines(chunk.toString("utf8"), buffer);

    if (streamName === "stdout") {
      stdoutBuffer = result.previous;
    } else {
      stderrBuffer = result.previous;
    }

    for (const line of result.lines) {
      const redactedLine = redact(line);

      if (options.verbose) {
        const write = streamName === "stderr" ? process.stderr.write.bind(process.stderr) : process.stdout.write.bind(process.stdout);
        write(`[${options.jobId}] ${stepPrefix(options.step)}${redactedLine}\n`);
      }

      await options.client.sendEvent(options.jobId, {
        type: "log.line",
        step: options.step,
        line: redactedLine,
      });
    }
  };

  child.stdout.on("data", (chunk: Buffer) => {
    sendQueue = sendQueue.then(() => sendLines(chunk, "stdout"));
  });

  child.stderr.on("data", (chunk: Buffer) => {
    sendQueue = sendQueue.then(() => sendLines(chunk, "stderr"));
  });

  return await new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", async (exitCode) => {
      await sendQueue;

      if (stdoutBuffer) {
        const redactedStdoutBuffer = redact(stdoutBuffer);

        if (options.verbose) {
          process.stdout.write(`[${options.jobId}] ${stepPrefix(options.step)}${redactedStdoutBuffer}\n`);
        }

        await options.client.sendEvent(options.jobId, { type: "log.line", step: options.step, line: redactedStdoutBuffer });
      }

      if (stderrBuffer) {
        const redactedStderrBuffer = redact(stderrBuffer);

        if (options.verbose) {
          process.stderr.write(`[${options.jobId}] ${stepPrefix(options.step)}${redactedStderrBuffer}\n`);
        }

        await options.client.sendEvent(options.jobId, { type: "log.line", step: options.step, line: redactedStderrBuffer });
      }

      resolve(exitCode ?? 1);
    });
  });
};
