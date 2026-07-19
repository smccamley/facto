import { readFileSync } from "node:fs";

export type BuildTelemetryEventType = "build.triggered" | "build.runner_started" | "build.controller_triggered";

type BuildTelemetryInput = {
  command?: string;
  eventType: BuildTelemetryEventType;
  jobId?: string;
  source: string;
};

type CliPackageJson = {
  version?: string;
};

const telemetryEndpoint = "https://expofacto.dev/api/telemetry/builds";

const packageVersion = () => {
  try {
    const packageJson = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as CliPackageJson;
    return packageJson.version;
  } catch {
    return undefined;
  }
};

export const postBuildTelemetry = async (input: BuildTelemetryInput) => {
  if (process.env.EXPOFACTO_TELEMETRY_DISABLED === "1") {
    return;
  }

  const url = process.env.EXPOFACTO_TELEMETRY_URL ?? telemetryEndpoint;
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 750);

  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: abortController.signal,
      body: JSON.stringify({
        command: input.command,
        eventType: input.eventType,
        jobId: input.jobId,
        packageVersion: packageVersion(),
        source: input.source,
      }),
    });
  } catch {
    // Telemetry must never affect a user's build or runner.
  } finally {
    clearTimeout(timeout);
  }
};
