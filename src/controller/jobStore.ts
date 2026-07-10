import { randomUUID } from "node:crypto";
import type { BuildJob, CreateJobInput, JobArtifact, WorkerEventInput } from "../shared/jobTypes.js";
import { nowIso } from "../shared/time.js";
import type { ControllerDatabase } from "./database.js";
import { rowToJob, type JobRow } from "./jobRows.js";

const retrySafeStates = ["leased", "checkout", "install", "check", "prebuild"];

export const createJobStore = (database: ControllerDatabase) => {
  const createJob = (input: CreateJobInput) => {
    const timestamp = nowIso();
    const job: BuildJob = {
      id: randomUUID(),
      project: input.project,
      platform: "ios",
      repoUrl: input.repoUrl,
      gitRef: input.gitRef,
      appPath: input.appPath ?? ".",
      profile: input.profile ?? "production",
      submit: input.submit ?? "none",
      checks: input.checks ?? ["npm run check"],
      status: "queued",
      currentStep: null,
      triggerSource: input.triggerSource ?? "cli",
      workerName: null,
      commitSha: null,
      artifactPath: null,
      errorSummary: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      startedAt: null,
      finishedAt: null,
      leasedAt: null,
      lastHeartbeatAt: null,
    };

    database
      .prepare(
        `INSERT INTO jobs (
          id, project, platform, repo_url, git_ref, app_path, profile, submit,
          checks_json, status, trigger_source, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        job.id,
        job.project,
        job.platform,
        job.repoUrl,
        job.gitRef,
        job.appPath,
        job.profile,
        job.submit,
        JSON.stringify(job.checks),
        job.status,
        job.triggerSource,
        job.createdAt,
        job.updatedAt
      );

    return job;
  };

  const listJobs = (limit = 25) => {
    const rows = database.prepare("SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?").all(limit);
    return rows.map(rowToJob);
  };

  const getJob = (jobId: string) => {
    const row = database.prepare("SELECT * FROM jobs WHERE id = ?").get(jobId);
    return row ? rowToJob(row as JobRow) : null;
  };

  const getJobDetail = (jobId: string) => ({
    job: getJob(jobId),
    steps: database.prepare("SELECT * FROM steps WHERE job_id = ? ORDER BY started_at").all(jobId),
    logs: database.prepare("SELECT * FROM logs WHERE job_id = ? ORDER BY id DESC LIMIT 250").all(jobId),
    artifacts: database.prepare("SELECT * FROM artifacts WHERE job_id = ? ORDER BY created_at DESC").all(jobId),
  });

  const expireStaleLeases = () => {
    const cutoff = new Date(Date.now() - 90_000).toISOString();
    const rows = database
      .prepare(
        `SELECT id FROM jobs
         WHERE status IN (${retrySafeStates.map(() => "?").join(",")})
         AND last_heartbeat_at IS NOT NULL
         AND last_heartbeat_at < ?`
      )
      .all(...retrySafeStates, cutoff) as JobRow[];

    for (const row of rows) {
      database
        .prepare(
          `UPDATE jobs
           SET status = 'queued', current_step = NULL, worker_name = NULL,
               leased_at = NULL, last_heartbeat_at = NULL, updated_at = ?
           WHERE id = ?`
        )
        .run(nowIso(), String(row.id));
    }
  };

  const leaseNextJob = (workerName: string) => {
    expireStaleLeases();
    const row = database.prepare("SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1").get();

    if (!row) {
      return null;
    }

    const timestamp = nowIso();
    database
      .prepare(
        `UPDATE jobs
         SET status = 'leased', worker_name = ?, leased_at = ?,
             last_heartbeat_at = ?, updated_at = ?
         WHERE id = ? AND status = 'queued'`
      )
      .run(workerName, timestamp, timestamp, timestamp, String((row as JobRow).id));

    return getJob(String((row as JobRow).id));
  };

  const recordEvent = (jobId: string, event: WorkerEventInput) => {
    const timestamp = nowIso();

    if (event.type === "worker.heartbeat") {
      database.prepare("UPDATE jobs SET last_heartbeat_at = ?, updated_at = ? WHERE id = ?").run(timestamp, timestamp, jobId);
      return;
    }

    if (event.type === "step.started" && event.step) {
      database
        .prepare(
          `INSERT OR REPLACE INTO steps (job_id, name, status, started_at)
           VALUES (?, ?, 'running', ?)`
        )
        .run(jobId, event.step, timestamp);
      database
        .prepare(
          `UPDATE jobs SET status = ?, current_step = ?, started_at = COALESCE(started_at, ?), updated_at = ?
           WHERE id = ?`
        )
        .run(event.step, event.step, timestamp, timestamp, jobId);
      return;
    }

    if (event.type === "log.line" && event.line) {
      database.prepare("INSERT INTO logs (job_id, step, line, created_at) VALUES (?, ?, ?, ?)").run(jobId, event.step ?? null, event.line, timestamp);
      return;
    }

    if (event.type === "step.finished" && event.step) {
      database
        .prepare(
          `UPDATE steps SET status = ?, finished_at = ?, exit_code = ?, summary = ?
           WHERE job_id = ? AND name = ?`
        )
        .run(event.status ?? "complete", timestamp, event.exitCode ?? null, event.summary ?? null, jobId, event.step);
      return;
    }

    if (event.type === "job.finished") {
      const status = event.status === "failed" ? "failed" : "complete";
      database
        .prepare(
          `UPDATE jobs SET status = ?, current_step = NULL, commit_sha = COALESCE(?, commit_sha),
             error_summary = ?, finished_at = ?, updated_at = ?
           WHERE id = ? AND status != 'cancelled'`
        )
        .run(status, event.commitSha ?? null, event.summary ?? null, timestamp, timestamp, jobId);
    }
  };

  const createArtifact = (jobId: string, artifact: Omit<JobArtifact, "id" | "createdAt">) => {
    const id = randomUUID();
    const timestamp = nowIso();
    database
      .prepare("INSERT INTO artifacts (id, job_id, kind, path, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, jobId, artifact.kind, artifact.path, artifact.sizeBytes, timestamp);
    database.prepare("UPDATE jobs SET artifact_path = ?, updated_at = ? WHERE id = ?").run(artifact.path, timestamp, jobId);
    return { id, ...artifact, createdAt: timestamp };
  };

  const cancelJob = (jobId: string) => {
    database.prepare("UPDATE jobs SET status = 'cancelled', finished_at = ?, updated_at = ? WHERE id = ?").run(nowIso(), nowIso(), jobId);
  };

  return { createJob, listJobs, getJob, getJobDetail, leaseNextJob, recordEvent, createArtifact, cancelJob };
};
