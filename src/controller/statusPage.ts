import type { BuildJob } from "../shared/jobTypes.js";
import { formatDuration } from "../shared/time.js";

const escapeHtml = (value: string | null | undefined) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const statusClass = (status: string) => {
  if (status === "complete") {
    return "good";
  }

  if (status === "failed" || status === "cancelled") {
    return "bad";
  }

  return "active";
};

export const renderStatusPage = (jobs: BuildJob[], logsByJobId: Map<string, string[]>) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="refresh" content="10" />
    <title>Facto Builds</title>
    <style>
      :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { margin: 0; background: #f6f7f9; color: #15171a; }
      header { padding: 24px 32px 12px; border-bottom: 1px solid #dde1e7; background: #fff; }
      h1 { margin: 0 0 6px; font-size: 24px; letter-spacing: 0; }
      main { padding: 24px 32px 40px; }
      table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #dde1e7; }
      th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #e8ebef; vertical-align: top; font-size: 14px; }
      th { color: #5a6270; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; background: #fbfcfd; }
      code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
      .pill { display: inline-block; min-width: 72px; padding: 3px 8px; border-radius: 999px; text-align: center; font-size: 12px; font-weight: 650; }
      .good { background: #dff6e8; color: #176b3b; }
      .bad { background: #ffe1df; color: #a12b21; }
      .active { background: #e3edff; color: #264f9c; }
      .muted { color: #687384; }
      .logs { max-width: 460px; white-space: pre-wrap; color: #303741; }
      .empty { padding: 32px; background: #fff; border: 1px solid #dde1e7; }
      @media (max-width: 900px) {
        header, main { padding-left: 16px; padding-right: 16px; }
        table, tbody, tr, td { display: block; }
        thead { display: none; }
        tr { border-bottom: 1px solid #dde1e7; }
        td { border: 0; }
        td::before { content: attr(data-label); display: block; color: #687384; font-size: 11px; text-transform: uppercase; margin-bottom: 4px; }
      }
    </style>
  </head>
  <body>
    <header>
      <h1>Facto Builds</h1>
      <div class="muted">Operational build queue and worker status</div>
    </header>
    <main>
      ${
        jobs.length === 0
          ? '<div class="empty">No build jobs yet.</div>'
          : `<table>
        <thead>
          <tr>
            <th>Project</th>
            <th>Ref</th>
            <th>Status</th>
            <th>Worker</th>
            <th>Duration</th>
            <th>Artifact</th>
            <th>Last Logs</th>
          </tr>
        </thead>
        <tbody>
          ${jobs
            .map((job) => {
              const logs = logsByJobId.get(job.id) ?? [];
              return `<tr>
                <td data-label="Project"><strong>${escapeHtml(job.project)}</strong><br /><code>${escapeHtml(job.id)}</code></td>
                <td data-label="Ref"><code>${escapeHtml(job.gitRef)}</code><br /><span class="muted">${escapeHtml(job.commitSha)}</span></td>
                <td data-label="Status"><span class="pill ${statusClass(job.status)}">${escapeHtml(job.status)}</span><br /><span class="muted">${escapeHtml(job.currentStep)}</span></td>
                <td data-label="Worker">${escapeHtml(job.workerName) || '<span class="muted">unassigned</span>'}</td>
                <td data-label="Duration">${escapeHtml(formatDuration(job.startedAt, job.finishedAt))}</td>
                <td data-label="Artifact">${job.artifactPath ? `<code>${escapeHtml(job.artifactPath)}</code>` : '<span class="muted">none</span>'}</td>
                <td data-label="Last Logs"><div class="logs">${escapeHtml(logs.join("\n"))}</div></td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>`
      }
    </main>
  </body>
</html>`;

export const toLogLines = (rows: unknown[]) =>
  rows
    .slice()
    .reverse()
    .map((row) => String((row as { line?: unknown }).line ?? ""));
