# ADR 0001: Facto MVP V1 Drop-In EAS Build Replacement

Status: Proposed
Date: 2026-07-10

## Context

Expo EAS Build is currently the paid service used to build iOS apps and submit them to Apple TestFlight. For `PPL`, the expensive step is not the Expo SDK, config plugins, React Native, or client-side developer tooling. The expensive step is the hosted remote build runner and submission pipeline.

`PPL` is an Expo SDK 57 React Native app. Its production EAS profile builds an iOS App Store artifact, auto-increments the build number, signs the app, and submits to App Store Connect app `6788196898`. The app depends on Expo config plugin behavior for native configuration such as Secure Store, Clerk, HealthKit permissions, and HealthKit entitlement wiring.

The first version of Facto should therefore replace only the paid remote build step. It should keep Expo's open-source local tooling where it creates value and move the execution onto Mac hardware that we control or rent directly.

## Decision

Build Facto V1 as a small remote build orchestrator that runs Expo/EAS local iOS builds on a rented Scaleway Apple Silicon Mac mini.

Facto V1 will:

- Accept build requests from local projects or CI.
- Run the build on a remote macOS worker.
- Use `eas build --local` initially for build parity with Expo EAS.
- Use `eas submit` initially for TestFlight submission parity.
- Stream build status and logs to a small web status page.
- Store build records, step state, artifacts, and configuration independently from the source app repositories.
- Treat Scaleway Apple Silicon as the first runtime provider.

Facto V1 will not:

- Replace Expo SDK.
- Replace Expo prebuild.
- Replace Expo config plugins.
- Replace React Native native build internals.
- Build a general CI platform.
- Build a full frontend product beyond the status page.
- Manage multiple users, teams, billing, or fine-grained access control.

## Runtime Provider

Use Scaleway Apple Silicon M4-S as the default V1 Mac runtime.

Scaleway's Apple Silicon pricing page lists:

- `M4-S`: Apple M4, 16 GB RAM, 256 GB SSD, 1 Gbps, `EUR 149/month` or `EUR 0.22/hour`.
- `M4-M`: Apple M4, 32 GB RAM, 1.02 TB SSD, 1 Gbps up to 10 Gbps, `EUR 199/month` or `EUR 0.29/hour`.

Scaleway's Apple Silicon quickstart states that Apple Silicon is intended for developing, building, testing, and signing applications for Apple devices, and that macOS machines have a 24-hour minimum lease due to license constraints.

V1 starts with `M4-S` because it is the cheapest viable online Mac runtime found in the research pass. Upgrade to `M4-M` if the `M4-S` SSD or RAM constrains Xcode, DerivedData, CocoaPods, npm cache, or retained artifacts.

Provider references:

- Scaleway pricing: https://www.scaleway.com/en/pricing/apple-silicon/
- Scaleway M4 product page: https://www.scaleway.com/en/mac-mini-m4/
- Scaleway Apple Silicon quickstart: https://www.scaleway.com/en/docs/apple-silicon/quickstart/
- Scaleway commitment docs: https://www.scaleway.com/en/docs/apple-silicon/how-to/manage-commitment-plan/

## Expected Economics

Planning volume:

- Normal cadence: 10 builds/day, 5 days/week.
- Monthly estimate: 300 to 400 builds/month.
- Planning build duration: 10 to 15 minutes after warm-cache optimization.

At Scaleway `M4-S` hourly pricing:

- 300 builds at 10 minutes: 50 build-hours, around `EUR 11` raw runtime.
- 300 builds at 15 minutes: 75 build-hours, around `EUR 17` raw runtime.
- 400 builds at 10 minutes: 67 build-hours, around `EUR 15` raw runtime.
- 400 builds at 15 minutes: 100 build-hours, around `EUR 22` raw runtime.

The raw runtime math is not the full bill because Scaleway requires a 24-hour minimum macOS lease. In practice, Facto V1 should expect one of two modes:

- Burst mode: rent an `M4-S` on build days, pay at least 24 hours per started lease.
- Monthly mode: keep one `M4-S` alive for `EUR 149/month` to preserve caches and simplify operations.

Given the target of 300 to 400 builds/month and the importance of warm caches, the preferred V1 operating mode is monthly `M4-S` if builds are frequent. Hourly burst mode is useful during early testing or low-volume periods.

## Architecture

Facto has two processes:

1. Controller
2. Mac worker

The controller is a small web/API service that can run on cheap Linux hosting. It owns:

- Build request API.
- Build queue.
- Build status page.
- Job state.
- Project configuration.
- Secret references.
- Log ingestion.
- Artifact metadata.

The Mac worker runs on Scaleway macOS. It owns:

- Polling the controller for queued jobs.
- Preparing the local checkout.
- Injecting project environment variables.
- Running checks.
- Running Expo/EAS local build commands.
- Running submission commands.
- Streaming step status and logs back to the controller.
- Cleaning old workspaces, DerivedData, and artifacts.

The worker must connect outbound to the controller. The controller must not need inbound SSH access to the Mac worker for normal job execution.

```text
app repo / CI / local CLI
  -> Facto controller API
  -> queued build job
  -> Scaleway Mac worker polls job
  -> checkout repo/ref/project
  -> check
  -> build .ipa
  -> submit to TestFlight
  -> status/logs/artifact metadata
```

## V1 Components

### Controller

The controller can start as a single Node.js service with SQLite.

Required capabilities:

- `POST /api/jobs`: create a build job.
- `GET /api/jobs`: list recent jobs.
- `GET /api/jobs/:jobId`: return job detail.
- `POST /api/worker/lease`: worker asks for next job.
- `POST /api/worker/jobs/:jobId/events`: worker posts state/log events.
- `POST /api/worker/jobs/:jobId/artifacts`: worker registers artifact metadata.
- `GET /`: status page.

SQLite is acceptable for V1 because there is one controller and one worker. The schema should be boring and easy to inspect.

### Worker

The worker is a long-running process launched by `launchd` on the Scaleway Mac.

Required behavior:

- Register itself with the controller on startup.
- Poll for queued jobs.
- Acquire at most one job at a time.
- Send heartbeat every 15 seconds during active jobs.
- Stream logs line-by-line.
- Mark a job failed if a command exits non-zero.
- Retry controller event upload on transient network failures.
- Never print secret values.
- Exit non-zero on unrecoverable local toolchain failure so `launchd` restarts it.

### CLI

V1 should include a small CLI so app repos can trigger builds without knowing the HTTP details.

Example:

```bash
facto build ios \
  --project ppl \
  --repo git@github.com:OWNER/REPO.git \
  --ref main \
  --path packages/ppl \
  --profile production \
  --submit testflight
```

The CLI should print the job URL immediately.

## Project Configuration

Facto should support both controller-stored project config and repository-local config. V1 may begin with controller-stored config for speed, but the intended app-facing format is `facto.yml`.

Example `facto.yml`:

```yaml
version: 1
project: ppl
defaultPlatform: ios
repo:
  provider: github
  defaultRef: main
app:
  path: packages/ppl
  packageManager: npm
ios:
  profile: production
  appStoreConnectAppId: "6788196898"
  expectedBundleIdentifier: ppl.stuartmccamley.com
  artifactPath: .facto/artifacts/ppl.ipa
checks:
  - npm run check
env:
  required:
    - EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
    - EXPO_PUBLIC_OPEN_MEMORIES_API_URL
    - OPEN_MEMORIES_CLERK_ENV
secrets:
  required:
    - EXPO_TOKEN
    - EXPO_APPLE_ID
    - EXPO_APPLE_PASSWORD
```

For `PPL`, V1 can map from the existing environment expectations:

- `EXPO_TOKEN`
- `EXPO_PUBLIC_OPEN_MEMORIES_API_URL`
- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `OPEN_MEMORIES_CLERK_ENV=live`
- `EXPO_APPLE_ID`
- `EXPO_APPLE_PASSWORD`

## Build State Machine

Jobs move through these states:

- `queued`
- `leased`
- `checkout`
- `install`
- `check`
- `prebuild`
- `build`
- `submit`
- `complete`
- `failed`
- `cancelled`

Each state has:

- `startedAt`
- `finishedAt`
- `status`
- `exitCode`, when applicable
- `summary`

Failure should preserve the failed step and the last log lines.

## Build Execution Flow

V1 should prioritize correctness and parity first.

Initial command sequence for `PPL`:

```bash
git clone or git fetch
git checkout <ref>
cd packages/ppl
npm ci
npm run check
CI=1 npx expo prebuild --platform ios
npx eas-cli@latest build \
  --platform ios \
  --profile production \
  --local \
  --output .facto/artifacts/ppl.ipa \
  --non-interactive \
  --freeze-credentials
npx eas-cli@latest submit \
  --platform ios \
  --profile production \
  --path .facto/artifacts/ppl.ipa \
  --non-interactive
```

This intentionally resembles the existing Expo path so the first migration changes only the execution venue.

## Warm Build Optimization

After the first successful parity build, optimize for 10 to 15 minute warm builds.

The worker should keep a persistent workspace per project:

```text
/opt/facto/workspaces/ppl/repo
/opt/facto/cache/ppl/npm
/opt/facto/cache/ppl/derived-data
/opt/facto/cache/ppl/artifacts
```

The worker should classify a build before executing expensive setup.

JS-only changes:

- Skip `expo prebuild`.
- Skip `pod install`.
- Skip `npm ci` if `package-lock.json` did not change.
- Run checks.
- Build/export/sign/submit.

Native dependency or config changes:

- Run `npm ci`.
- Run `expo prebuild --platform ios`.
- Run the full EAS local build.

Native indicators:

- `package.json`
- `package-lock.json`
- `app.json`
- `app.config.js`
- `eas.json`
- `ios/**`
- config plugin changes

V1 may still run the full parity path by default. Warm build classification is a required V1.1 optimization, not a prerequisite for the first working build.

## Future Direct Xcode Path

Once EAS-local parity is proven, Facto should add a direct Xcode build path for speed and control:

```bash
xcodebuild archive \
  -workspace ios/PPL.xcworkspace \
  -scheme PPL \
  -configuration Release \
  -derivedDataPath /opt/facto/cache/ppl/derived-data \
  -archivePath .facto/build/PPL.xcarchive

xcodebuild -exportArchive \
  -archivePath .facto/build/PPL.xcarchive \
  -exportPath .facto/build \
  -exportOptionsPlist .facto/ExportOptions.plist
```

This is not part of the first V1 build because `eas build --local` gives safer parity.

## Secrets

V1 must treat secrets as runtime-only values.

Rules:

- Secrets are stored in the controller encrypted at rest, or loaded on the Mac worker from a local encrypted file during the earliest prototype.
- Secrets are injected into command environments only for the steps that need them.
- Logs must redact secret values and common token patterns.
- The worker must not echo full environment variables.
- Build artifacts must not include `.env` files.
- Apple credentials should be replaced with App Store Connect API keys in a later version.

Initial secret set:

- Git deploy key or GitHub token.
- Expo token for local EAS tooling.
- Apple login credentials or App Store Connect API key.
- Clerk publishable key for live builds.
- Open Memories API URL.

## Status Page

V1 has one web page.

It should show:

- Recent jobs.
- Project name.
- Git ref and commit SHA.
- Trigger source.
- Current state.
- Duration.
- Worker name.
- Build number, when known.
- Artifact path, when available.
- TestFlight submission status, when known.
- Last log lines.
- Failure summary.

The status page is operational UI, not a marketing site.

## Artifact Retention

Store final `.ipa` artifacts for short-term debugging.

V1 retention:

- Keep successful `.ipa` artifacts for 7 days.
- Keep failed job logs for 30 days.
- Keep successful job logs for 14 days.
- Delete intermediate archives after successful upload unless debugging is enabled.

Artifacts can start on local disk. Object storage is a later improvement.

## Worker Provisioning

The Scaleway Mac should be provisioned with:

- Xcode 26.x or the App Store Connect-required current version.
- Node.js 24.
- npm.
- CocoaPods.
- Ruby and fastlane.
- Expo CLI via `npx`.
- EAS CLI via `npx eas-cli@latest`.
- Git.
- A dedicated `facto` user.
- `launchd` service for the worker.
- SSH access restricted to trusted operator keys.

The worker bootstrap script should verify:

- `xcodebuild -version`
- `xcrun --sdk iphoneos --show-sdk-version`
- `node --version`
- `npm --version`
- `ruby --version`
- `pod --version`
- `git --version`

## Observability

V1 observability is structured events plus logs.

Events:

- `job.created`
- `job.leased`
- `step.started`
- `log.line`
- `step.finished`
- `artifact.created`
- `submission.started`
- `submission.finished`
- `job.finished`
- `worker.heartbeat`
- `worker.toolchain_checked`

The controller status page can be built directly from these events and derived job records.

## Reliability

V1 reliability requirements:

- A worker lease expires if no heartbeat is received for 90 seconds.
- Expired jobs return to `queued` only if the current step is retry-safe.
- Build steps are not blindly retried after signing or submission begins.
- The controller can mark a job `cancelled`.
- The worker checks cancellation between steps.
- A stuck worker process is restarted by `launchd`.

## Security Boundary

The Mac worker is trusted infrastructure. It will handle source code, signing material, and submission credentials.

V1 security decisions:

- Only trusted repositories can create jobs.
- The controller requires an API token for job creation.
- Worker endpoints require a worker token.
- The worker polls outbound; no public inbound API on the Mac.
- Secrets are never sent to clients through job APIs.
- Status page may be private initially behind a single shared operator token.

## MVP Acceptance Criteria

Facto V1 is complete when:

- A `PPL` production iOS build can be triggered through Facto.
- The build runs on Scaleway Apple Silicon, not Expo-hosted EAS Build.
- The build produces an `.ipa`.
- The `.ipa` is submitted to TestFlight.
- The status page shows queued/running/success/failed state.
- Logs are visible from the status page.
- A failed build clearly identifies the failed step.
- Secrets are not printed in logs.
- The worker can survive restart and accept another job.
- The controller and worker can be redeployed independently.

## Implementation Milestones

### Milestone 1: Skeleton

- Create the controller service.
- Create SQLite schema.
- Add job creation API.
- Add status page with static job data.
- Add worker polling API.

### Milestone 2: Local Worker Prototype

- Run worker locally on a Mac.
- Execute a shell command job.
- Stream logs to controller.
- Record state transitions.

### Milestone 3: Scaleway Worker

- Provision Scaleway `M4-S`.
- Install toolchain.
- Install worker as `launchd` service.
- Run a simple remote job.
- Confirm heartbeat and log streaming.

### Milestone 4: PPL Parity Build

- Add `PPL` project config.
- Checkout the `me` repository.
- Inject required environment.
- Run `npm ci`.
- Run `npm run check`.
- Run `eas build --local`.
- Store `.ipa` metadata.

### Milestone 5: TestFlight Submit

- Run `eas submit`.
- Capture submission result.
- Surface TestFlight/App Store Connect metadata where available.

### Milestone 6: Warm Build Path

- Preserve project workspace.
- Preserve npm, CocoaPods, Expo, and Xcode caches.
- Skip unnecessary setup steps.
- Track build duration.
- Target 10 to 15 minute warm builds.

## Open Questions

- Should V1 run the controller on a standalone cheap VPS or inside an existing Open Memories host?
- Should the status page be private by shared token or placed behind Clerk from day one?
- Should project config initially live in the controller database or in a repo-level `facto.yml`?
- Should V1 use `eas submit` first or go directly to Fastlane/App Store Connect API key upload?
- Should hourly Scaleway leasing be automated immediately, or should we begin with a monthly M4-S while build volume is high?

## Consequences

This approach saves money by moving the expensive build compute away from Expo while keeping the parts of Expo that are valuable and hard to recreate.

The cost is that Facto becomes responsible for Mac worker health, Xcode updates, signing environment stability, logs, secrets, and operational debugging. That is acceptable for V1 because the scope is deliberately narrow and the runtime is one worker, one primary app, and one build path.

The key engineering bet is that a persistent or semi-persistent Mac worker with warm caches will make frequent `PPL` TestFlight builds cheaper and eventually faster than paid hosted EAS builds.
