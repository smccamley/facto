export const jobStates = [
  "queued",
  "leased",
  "checkout",
  "install",
  "check",
  "prebuild",
  "build",
  "submit",
  "complete",
  "failed",
  "cancelled",
] as const;

export type JobState = (typeof jobStates)[number];

export type SubmitTarget = "none" | "testflight";

export type BuildJob = {
  id: string;
  project: string;
  platform: "ios";
  repoUrl: string;
  gitRef: string;
  appPath: string;
  profile: string;
  submit: SubmitTarget;
  checks: string[];
  env?: Record<string, string>;
  status: JobState;
  currentStep: string | null;
  triggerSource: string;
  workerName: string | null;
  commitSha: string | null;
  artifactPath: string | null;
  errorSummary: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  leasedAt: string | null;
  lastHeartbeatAt: string | null;
};

export type JobStep = {
  name: string;
  status: "running" | "complete" | "failed";
  startedAt: string;
  finishedAt: string | null;
  exitCode: number | null;
  summary: string | null;
};

export type JobArtifact = {
  id: string;
  kind: string;
  path: string;
  sizeBytes: number | null;
  createdAt: string;
};

export type JobLogLine = {
  id: number;
  step: string | null;
  line: string;
  createdAt: string;
};

export type CreateJobInput = {
  project: string;
  platform?: "ios";
  repoUrl: string;
  gitRef: string;
  appPath?: string;
  profile?: string;
  submit?: SubmitTarget;
  checks?: string[];
  triggerSource?: string;
};

export type WorkerEventInput = {
  type:
    | "worker.heartbeat"
    | "step.started"
    | "log.line"
    | "step.finished"
    | "job.finished";
  step?: string;
  line?: string;
  status?: "complete" | "failed";
  exitCode?: number;
  summary?: string;
  commitSha?: string;
};
