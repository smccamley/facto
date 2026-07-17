import { mkdirSync } from "node:fs";
import { loadFactoEnv } from "../shared/envFile.js";
import { createControllerClient } from "./controllerClient.js";
import { runJob } from "./runJob.js";
import { runRunnerPreflight } from "./preflight.js";
import { formatRunnerError } from "./runnerErrors.js";

loadFactoEnv([".facto/worker.env", "/opt/facto/secrets/worker.env"]);

const sleep = async (milliseconds: number) => {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
};

const sendHeartbeatUntilStopped = (client: ReturnType<typeof createControllerClient>, jobId: string) => {
  let stopped = false;

  const sendHeartbeat = async () => {
    while (!stopped) {
      await client.sendEvent(jobId, { type: "worker.heartbeat" });
      await sleep(15_000);
    }
  };

  void sendHeartbeat().catch((error) => {
    console.error(`Runner heartbeat failed: ${formatRunnerError(error)}`);
  });
  return () => {
    stopped = true;
  };
};

const workLoop = async () => {
  const controllerUrl = "https://expofacto.dev";
  const workerToken = process.env.FACTO_WORKER_TOKEN;
  const workerName = process.env.FACTO_WORKER_NAME;
  const workspaceRoot = process.env.FACTO_WORKSPACE_ROOT ?? ".facto-worker/workspaces";
  const pollIntervalMs = Number(process.env.FACTO_POLL_INTERVAL_MS ?? 5000);
  const verbose = process.env.FACTO_VERBOSE === "1" || process.argv.includes("--verbose") || process.argv.includes("-V");

  if (!workerToken || !workerName) {
    throw new Error("FACTO_WORKER_TOKEN and FACTO_WORKER_NAME are required");
  }

  mkdirSync(workspaceRoot, { recursive: true });
  const client = createControllerClient(controllerUrl, workerToken, workerName);

  runRunnerPreflight({ verbose });

  console.log(`Facto worker ${workerName} polling ${controllerUrl}`);

  while (true) {
    const job = await client.leaseJob();

    if (!job) {
      await sleep(pollIntervalMs);
      continue;
    }

    const stopHeartbeat = sendHeartbeatUntilStopped(client, job.id);
    await runJob(client, job, workspaceRoot, { verbose });
    stopHeartbeat();
  }
};

workLoop().catch((error) => {
  console.error(formatRunnerError(error));
  process.exit(1);
});
