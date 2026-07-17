# Expo Facto

[![npm version](https://img.shields.io/npm/v/@expofacto/cli.svg)](https://www.npmjs.com/package/@expofacto/cli)
[![CI](https://github.com/smccamley/facto/actions/workflows/ci.yml/badge.svg)](https://github.com/smccamley/facto/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Self-host Expo EAS iOS builds on Mac hardware you control.

Expo is a great way to build native apps. Paying for every cloud build while you are iterating is the painful part. Expo Facto gives Expo apps a hosted queue, runner, and CLI for running the expensive iOS build step on your own Mac, then optionally submitting the IPA to TestFlight.

## 30-Second Example

Install Expo Facto in an Expo app repo:

```bash
npm install @expofacto/cli
npm run setup
npm run deploy
```

Or submit a build job directly with `EXPOFACTO_API_KEY` set:

```bash
npx --package @expofacto/cli expofacto build \
  --platform ios \
  --profile production \
  --auto-submit
```

Before the first build can run, save the Expo access token that runners use to call EAS:

```bash
npx --package @expofacto/cli expofacto env:create \
  --name EXPO_TOKEN \
  --value "$EXPO_TOKEN" \
  --environment production \
  --visibility secret
```

Result: an iOS IPA built with `eas build --local` on your Mac worker instead of Expo's remote build infrastructure.

## Why Engineers Use It

- **Avoid paid remote build minutes.** Keep Expo, but move iOS build compute onto your hardware.
- **Works with real Expo apps.** The worker loads readable EAS environment variables, runs install, checks, prebuild, local EAS build, and optional EAS Submit.
- **Good for frequent iteration.** Build as often as your Mac can handle while testing app binaries on devices.
- **Drop-in app setup.** `npm run setup` creates package scripts without adding an Expo Facto folder.
- **Plain infrastructure.** A hosted job queue, polling runners, usage logs, and pinned Git commits.

## What It Solves

Expo Facto is built for searches like:

- [Self-host Expo EAS builds on your own Mac](docs/use-cases/self-host-expo-eas-builds.md)
- [Replace Expo cloud iOS builds with local Mac workers](docs/use-cases/replace-expo-cloud-ios-builds.md)
- [Run TestFlight submissions from a self-hosted Expo build pipeline](docs/use-cases/testflight-from-self-hosted-expo-builds.md)
- [Configure Expo Facto for a monorepo Expo app](docs/use-cases/expo-monorepo-build-worker.md)

## App Setup

Install:

```bash
npm install @expofacto/cli
```

The postinstall step adds package scripts when they do not already exist.

Run setup:

```bash
npm run setup
```

Set `EXPOFACTO_API_KEY` in your shell or CI environment before deploying.

Expo Facto reads the same `eas.json` profiles as Expo. Add `expofacto.json` only when you need Expo Facto-specific commands before `expo prebuild`:

```json
{
  "build": {
    "ios": {
      "prebuild": ["npm run check", "npm run typecheck", "npm run test"]
    }
  }
}
```

Deploy:

```bash
npm run deploy
```

`EXPOFACTO_API_KEY` is the Expo Facto API key used by `deploy`, `build`, log reads, and runner registration. API keys are shown once in the dashboard, and any valid key for the account can submit jobs or start a runner.

## Account Env Values

Expo Facto copies the EAS env command shape so Expo users do not need to learn new muscle memory, but these commands manage Expo Facto account values. They do not create or update Expo EAS environment variables.

Create the `EXPO_TOKEN` that runners need for local EAS builds:

```bash
npx --package @expofacto/cli expofacto env:create \
  --name EXPO_TOKEN \
  --value "$EXPO_TOKEN" \
  --environment production \
  --visibility secret
```

Update it:

```bash
npx --package @expofacto/cli expofacto env:update \
  --name EXPO_TOKEN \
  --value "$EXPO_TOKEN" \
  --environment production \
  --visibility secret
```

Delete it:

```bash
npx --package @expofacto/cli expofacto env:delete --name EXPO_TOKEN
```

All three commands authenticate with `--api-key "$EXPOFACTO_API_KEY"` or the `EXPOFACTO_API_KEY` environment variable. Values are sent to the hosted Expo Facto service and are not printed back to the terminal.

Read hosted job events:

```bash
npx --package @expofacto/cli expofacto logs JOB_ID \
  --api-key "$EXPOFACTO_API_KEY"
```

The `logs` command reads `GET /api/jobs/:jobId/events` and prints the recorded build events in timestamp order.

Run the macOS runner preflight by itself:

```bash
npm run preflight:runner -- --verbose
```

Run a hosted macOS runner from a clean machine with the API key inline:

```bash
curl -fsSL https://raw.githubusercontent.com/smccamley/facto/main/install-runner.sh | bash -s -- --api-key EXPOFACTO_API_KEY
```

You can omit `--api-key` if `EXPOFACTO_API_KEY` is set:

```bash
export EXPOFACTO_API_KEY=facto_bX....qeLA
```

The installer creates `~/facto-runner`, checks for Node.js 24+ and `npx`, installs nvm and Node.js when they are missing, then starts the hosted runner. `expofacto start runner` runs the macOS preflight before polling for jobs. The preflight reads [docs/runner-toolchain.md](docs/runner-toolchain.md), installs missing Homebrew tools, repairs Xcode only when it is missing or too old, verifies GitHub access and the iOS SDK, and leaves already-working tools alone. Each leased job also validates `git`, `npm`, `npx`, and the `npx --package eas-cli@latest eas` entrypoint before checkout starts. App Store Connect credentials are checked when a job needs them. Set `XCODES_USERNAME` and `XCODES_PASSWORD` for unattended Xcode installs. Add `--verbose` to the installer command to mirror redacted build output to the runner terminal as well as the controller logs.

## Compatibility

| Area | Support |
| --- | --- |
| Runtime | Node.js 24+ |
| App platform | iOS |
| App framework | Expo / React Native apps using EAS |
| Build mode | `eas build --local` |
| Submit mode | Optional `eas submit` to TestFlight |
| Worker OS | macOS with Xcode and Apple signing access |
| Package managers | npm |

## Trust And Package Quality

- TypeScript source with emitted declaration files.
- MIT license.
- CI runs install, typecheck, tests, build, and package preview.
- npm publishes from GitHub Actions with provenance.
- Minimal runtime dependencies.
- Expo Facto account env values are stored encrypted by the hosted service and redacted from worker logs.

See [docs/secrets.md](docs/secrets.md) for credential setup and storage.

## Not Included Yet

- Scaleway provisioning.
- `launchd` installation.
- App Store Connect API key management.
- Warm-build change classification.
