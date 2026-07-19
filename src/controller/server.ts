import express, { type Request, type Response } from "express";
import { loadFactoEnv } from "../shared/envFile.js";
import { postBuildTelemetry } from "../shared/telemetry.js";
import { openControllerDatabase } from "./database.js";
import { createJobStore } from "./jobStore.js";
import { renderStatusPage, toLogLines } from "./statusPage.js";

loadFactoEnv([".facto/controller.env"]);

const controllerPort = Number(process.env.FACTO_CONTROLLER_PORT ?? 4100);
const databasePath = process.env.FACTO_DATABASE_PATH ?? ".facto/controller.sqlite";
const apiToken = process.env.EXPOFACTO_API_KEY;
const workerToken = process.env.FACTO_WORKER_TOKEN;

if (!apiToken || !workerToken) {
  throw new Error("EXPOFACTO_API_KEY and FACTO_WORKER_TOKEN are required");
}

const getBearerToken = (request: Request) => {
  const header = request.header("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
};

const requireToken = (expectedToken: string) => (request: Request, response: Response, next: () => void) => {
  if (getBearerToken(request) !== expectedToken) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
};

const requireString = (body: Record<string, unknown>, key: string) => {
  const value = body[key];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${key} is required`);
  }

  return value;
};

const database = openControllerDatabase(databasePath);
const jobs = createJobStore(database);
const app = express();

app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.get("/", (_request, response) => {
  const recentJobs = jobs.listJobs(30);
  const logsByJobId = new Map(
    recentJobs.map((job) => [job.id, toLogLines(jobs.getJobDetail(job.id).logs)])
  );

  response.type("html").send(renderStatusPage(recentJobs, logsByJobId));
});

app.post("/api/jobs", requireToken(apiToken), (request, response) => {
  try {
    const body = request.body as Record<string, unknown>;
    const triggerSource = typeof body.triggerSource === "string" ? body.triggerSource : "api";
    const createdJob = jobs.createJob({
      project: requireString(body, "project"),
      platform: "ios",
      repoUrl: requireString(body, "repoUrl"),
      gitRef: requireString(body, "gitRef"),
      appPath: typeof body.appPath === "string" ? body.appPath : ".",
      profile: typeof body.profile === "string" ? body.profile : "production",
      submit: body.submit === "testflight" ? "testflight" : "none",
      checks: Array.isArray(body.checks) ? body.checks.map(String) : undefined,
      triggerSource,
    });

    void postBuildTelemetry({
      command: triggerSource,
      eventType: "build.controller_triggered",
      jobId: createdJob.id,
      source: "local-controller",
    });
    response.status(201).json({ job: createdJob, url: `/api/jobs/${createdJob.id}` });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Invalid job" });
  }
});

app.get("/api/jobs", (_request, response) => {
  response.json({ jobs: jobs.listJobs() });
});

app.get("/api/jobs/:jobId", (request, response) => {
  const jobId = String(request.params.jobId);
  const detail = jobs.getJobDetail(jobId);

  if (!detail.job) {
    response.status(404).json({ error: "Job not found" });
    return;
  }

  response.json(detail);
});

app.post("/api/jobs/:jobId/cancel", requireToken(apiToken), (request, response) => {
  jobs.cancelJob(String(request.params.jobId));
  response.json({ ok: true });
});

app.post("/api/worker/lease", requireToken(workerToken), (request, response) => {
  const workerName = requireString(request.body as Record<string, unknown>, "workerName");
  response.json({ job: jobs.leaseNextJob(workerName) });
});

app.post("/api/worker/jobs/:jobId/events", requireToken(workerToken), (request, response) => {
  jobs.recordEvent(String(request.params.jobId), request.body);
  response.json({ ok: true });
});

app.post("/api/worker/jobs/:jobId/artifacts", requireToken(workerToken), (request, response) => {
  const body = request.body as Record<string, unknown>;
  const artifact = jobs.createArtifact(String(request.params.jobId), {
    kind: requireString(body, "kind"),
    path: requireString(body, "path"),
    sizeBytes: typeof body.sizeBytes === "number" ? body.sizeBytes : null,
  });

  response.status(201).json({ artifact });
});

app.listen(controllerPort, () => {
  console.log(`Facto controller listening on http://localhost:${controllerPort}`);
});
