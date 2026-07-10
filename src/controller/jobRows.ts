import type { BuildJob, JobState } from "../shared/jobTypes.js";

export type JobRow = Record<string, unknown>;

export const rowToJob = (row: JobRow): BuildJob => ({
  id: String(row.id),
  project: String(row.project),
  platform: "ios",
  repoUrl: String(row.repo_url),
  gitRef: String(row.git_ref),
  appPath: String(row.app_path),
  profile: String(row.profile),
  submit: row.submit === "testflight" ? "testflight" : "none",
  checks: JSON.parse(String(row.checks_json)) as string[],
  status: String(row.status) as JobState,
  currentStep: row.current_step ? String(row.current_step) : null,
  triggerSource: String(row.trigger_source),
  workerName: row.worker_name ? String(row.worker_name) : null,
  commitSha: row.commit_sha ? String(row.commit_sha) : null,
  artifactPath: row.artifact_path ? String(row.artifact_path) : null,
  errorSummary: row.error_summary ? String(row.error_summary) : null,
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
  startedAt: row.started_at ? String(row.started_at) : null,
  finishedAt: row.finished_at ? String(row.finished_at) : null,
  leasedAt: row.leased_at ? String(row.leased_at) : null,
  lastHeartbeatAt: row.last_heartbeat_at ? String(row.last_heartbeat_at) : null,
});
