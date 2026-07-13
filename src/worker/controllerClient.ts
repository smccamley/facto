import type { BuildJob, WorkerEventInput } from "../shared/jobTypes.js";
import { formatHttpError, formatRequestFailure } from "./runnerErrors.js";

export type ControllerClient = {
  leaseJob: () => Promise<BuildJob | null>;
  sendEvent: (jobId: string, event: WorkerEventInput) => Promise<void>;
  registerArtifact: (jobId: string, artifact: { kind: string; path: string; sizeBytes: number | null }) => Promise<void>;
  getJob: (jobId: string) => Promise<BuildJob | null>;
  checkRunnerCommand?: () => Promise<{ type: "kill"; requestedAt: string | null } | null>;
  acknowledgeRunnerKill?: () => Promise<void>;
};

const sleep = async (milliseconds: number) => {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
};

const requestJson = async <T>(url: string, token: string, options: RequestInit) => {
  let lastError: unknown;

  const attempts = 3;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          ...options.headers,
        },
      });

      if (!response.ok) {
        throw new Error(await formatHttpError(response, { method: options.method, url }));
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      await sleep(250 * attempt);
    }
  }

  throw new Error(formatRequestFailure(lastError, { method: options.method, url, attempts }));
};

export const createControllerClient = (controllerUrl: string, workerToken: string, workerName: string): ControllerClient => {
  const baseUrl = controllerUrl.replace(/\/$/, "");

  return {
    leaseJob: async () => {
      const result = await requestJson<{ job: BuildJob | null }>(`${baseUrl}/api/worker/lease`, workerToken, {
        method: "POST",
        body: JSON.stringify({ workerName }),
      });
      return result.job;
    },

    sendEvent: async (jobId, event) => {
      await requestJson(`${baseUrl}/api/worker/jobs/${jobId}/events`, workerToken, {
        method: "POST",
        body: JSON.stringify(event),
      });
    },

    registerArtifact: async (jobId, artifact) => {
      await requestJson(`${baseUrl}/api/worker/jobs/${jobId}/artifacts`, workerToken, {
        method: "POST",
        body: JSON.stringify(artifact),
      });
    },

    getJob: async (jobId) => {
      const response = await fetch(`${baseUrl}/api/jobs/${jobId}`);

      if (!response.ok) {
        return null;
      }

      const detail = (await response.json()) as { job: BuildJob | null };
      return detail.job;
    },
  };
};
