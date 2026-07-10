import { mkdirSync } from "node:fs";
import { loadFactoEnv } from "../shared/envFile.js";
import { createControllerClient } from "./controllerClient.js";
import { runJob } from "./runJob.js";

loadFactoEnv([".facto/worker.env", "/opt/facto/secrets/worker.env"]);

const controllerUrl = process.env.FACTO_CONTROLLER_URL;
const workerToken = process.env.FACTO_WORKER_TOKEN;
const workerName = process.env.FACTO_WORKER_NAME;
const workspaceRoot = process.env.FACTO_WORKSPACE_ROOT ?? ".facto-worker/workspaces";
const pollIntervalMs = Number(process.env.FACTO_POLL_INTERVAL_MS ?? 5000);

if (!controllerUrl || !workerToken || !workerName) {
  throw new Error("FACTO_CONTROLLER_URL, FACTO_WORKER_TOKEN, and FACTO_WORKER_NAME are required");
}

mkdirSync(workspaceRoot, { recursive: true });

const client = createControllerClient(controllerUrl, workerToken, workerName);

const sleep = async (milliseconds: number) => {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
};

const sendHeartbeatUntilStopped = (jobId: string) => {
  let stopped = false;

  const sendHeartbeat = async () => {
    while (!stopped) {
      await client.sendEvent(jobId, { type: "worker.heartbeat" });
      await sleep(15_000);
    }
  };

  void sendHeartbeat();
  return () => {
    stopped = true;
  };
};

const workLoop = async () => {
  console.log(`Facto worker ${workerName} polling ${controllerUrl}`);

  while (true) {
    const job = await client.leaseJob();

    if (!job) {
      await sleep(pollIntervalMs);
      continue;
    }

    const stopHeartbeat = sendHeartbeatUntilStopped(job.id);
    await runJob(client, job, workspaceRoot);
    stopHeartbeat();
  }
};

workLoop().catch((error) => {
  console.error(error);
  process.exit(1);
});
