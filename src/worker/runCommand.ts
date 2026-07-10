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
};

const splitLines = (text: string, previous: string) => {
  const lines = `${previous}${text}`.split(/\r?\n/);
  const nextPrevious = lines.pop() ?? "";
  return { lines, previous: nextPrevious };
};

export const runCommand = async (options: RunCommandOptions) => {
  const env = { ...process.env, ...options.env };
  const redact = createRedactor(env);
  let stdoutBuffer = "";
  let stderrBuffer = "";
  let sendQueue = Promise.resolve();

  await options.client.sendEvent(options.jobId, {
    type: "log.line",
    step: options.step,
    line: `$ ${options.command} ${options.args.join(" ")}`,
  });

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
      await options.client.sendEvent(options.jobId, {
        type: "log.line",
        step: options.step,
        line: redact(line),
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
        await options.client.sendEvent(options.jobId, { type: "log.line", step: options.step, line: redact(stdoutBuffer) });
      }

      if (stderrBuffer) {
        await options.client.sendEvent(options.jobId, { type: "log.line", step: options.step, line: redact(stderrBuffer) });
      }

      resolve(exitCode ?? 1);
    });
  });
};
