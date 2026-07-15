import type { BuildJob, SubmitTarget, WorkerEventInput } from "../shared/jobTypes.js";
import type { ControllerClient } from "./controllerClient.js";
import { FactoHttpError, formatHttpError, formatRequestFailure, isFactoHttpError } from "./runnerErrors.js";

type HostedRunner = {
  id: string;
  name: string;
};

type HostedJob = {
  id: string;
  project: string;
  platform: string;
  repo_url: string;
  git_ref: string;
  app_path: string;
  profile: string;
  submit: string;
  status: string;
  runner_id: string | null;
  created_at: string;
  updated_at: string;
  leased_at?: string | null;
  finished_at?: string | null;
};

type HostedRegisterResponse = {
  runner: HostedRunner;
  leaseUrl: string;
  heartbeatUrl: string;
};

type HostedRunnerCommand = {
  type: "kill";
  requestedAt: string | null;
};

class RunnerKillRequestedError extends Error {
  constructor() {
    super("Runner was killed remotely");
    this.name = "RunnerKillRequestedError";
  }
}

export const isRunnerKillRequestedError = (error: unknown) => {
  return error instanceof RunnerKillRequestedError;
};

const sleep = async (milliseconds: number) => {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
};

const requestJson = async <T>(url: string, apiKey: string, options: RequestInit) => {
  let lastError: unknown;

  const attempts = 3;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
          ...options.headers,
        },
      });

      if (!response.ok) {
        throw new FactoHttpError(await formatHttpError(response, { method: options.method, url }));
      }

      return (await response.json()) as T;
    } catch (error) {
      if (isFactoHttpError(error)) {
        throw error;
      }

      lastError = error;
      await sleep(250 * attempt);
    }
  }

  throw new Error(formatRequestFailure(lastError, { method: options.method, url, attempts }));
};

const toSubmitTarget = (value: string): SubmitTarget => (value === "testflight" ? "testflight" : "none");

export const mapHostedJob = (job: HostedJob): BuildJob => ({
  id: job.id,
  project: job.project,
  platform: "ios",
  repoUrl: job.repo_url,
  gitRef: job.git_ref,
  appPath: job.app_path,
  profile: job.profile,
  submit: toSubmitTarget(job.submit),
  checks: [],
  status: job.status === "leased" ? "leased" : "queued",
  currentStep: null,
  triggerSource: "hosted",
  workerName: job.runner_id,
  commitSha: null,
  artifactPath: null,
  errorSummary: null,
  createdAt: job.created_at,
  updatedAt: job.updated_at,
  startedAt: null,
  finishedAt: job.finished_at ?? null,
  leasedAt: job.leased_at ?? null,
  lastHeartbeatAt: null,
});

export const hostedEventBody = (event: WorkerEventInput) => {
  const message =
    event.line ??
    event.summary ??
    (event.status ? `${event.status}${event.exitCode === undefined ? "" : ` exit ${event.exitCode}`}` : undefined);

  return {
    eventType: event.type,
    step: event.step,
    message,
    status: event.status,
    exitCode: event.exitCode,
  };
};

const absoluteUrl = (baseUrl: string, path: string) => {
  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
};

export const createHostedRunnerClient = async (options: {
  serviceUrl: string;
  apiKey: string;
  runnerName: string;
  version?: string;
}): Promise<{ runner: HostedRunner; client: ControllerClient }> => {
  const baseUrl = options.serviceUrl.replace(/\/$/, "");
  const registered = await requestJson<HostedRegisterResponse>(`${baseUrl}/api/runners`, options.apiKey, {
    method: "POST",
    body: JSON.stringify({
      name: options.runnerName,
      platform: "ios",
      version: options.version,
    }),
  });
  const leaseUrl = absoluteUrl(baseUrl, registered.leaseUrl);
  const heartbeatUrl = absoluteUrl(baseUrl, registered.heartbeatUrl);
  const acknowledgeKillUrl = absoluteUrl(baseUrl, `/api/runners/${registered.runner.id}/kill/ack`);

  return {
    runner: registered.runner,
    client: {
      leaseJob: async () => {
        const result = await requestJson<{ job: HostedJob | null; command?: HostedRunnerCommand | null }>(leaseUrl, options.apiKey, { method: "POST" });

        if (result.command?.type === "kill") {
          throw new RunnerKillRequestedError();
        }

        return result.job ? mapHostedJob(result.job) : null;
      },

      sendEvent: async (jobId, event) => {
        await requestJson(`${baseUrl}/api/jobs/${jobId}/events`, options.apiKey, {
          method: "POST",
          body: JSON.stringify(hostedEventBody(event)),
        });
      },

      registerArtifact: async (jobId, artifact) => {
        await requestJson(`${baseUrl}/api/jobs/${jobId}/events`, options.apiKey, {
          method: "POST",
          body: JSON.stringify({
            eventType: "artifact.registered",
            message: `${artifact.kind} ${artifact.path} ${artifact.sizeBytes ?? 0} bytes`,
          }),
        });
      },

      getJob: async () => null,

      checkRunnerCommand: async () => {
        const result = await requestJson<{ command?: HostedRunnerCommand | null }>(heartbeatUrl, options.apiKey, { method: "POST" });
        return result.command ?? null;
      },

      acknowledgeRunnerKill: async () => {
        await requestJson(acknowledgeKillUrl, options.apiKey, { method: "POST" });
      },
    },
  };
};
