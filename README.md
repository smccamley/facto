# Expo Facto

[![npm version](https://img.shields.io/npm/v/@expofacto/cli.svg)](https://www.npmjs.com/package/@expofacto/cli)
[![CI](https://github.com/smccamley/facto/actions/workflows/ci.yml/badge.svg)](https://github.com/smccamley/facto/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Self-host Expo EAS iOS builds on Mac hardware you control.

Expo is a great way to build native apps. Paying for every cloud build while you are iterating is the painful part. Expo Facto gives Expo apps a small controller, worker, and CLI for running the expensive iOS build step on your own Mac, then optionally submitting the IPA to TestFlight.

## 30-Second Example

Install Expo Facto in an Expo app repo:

```bash
npm install @expofacto/cli
npm run setup
npm run deploy
```

Or submit a build job directly:

```bash
npx expofacto build ios \
  --controller-url http://localhost:4100 \
  --token "$FACTO_API_TOKEN" \
  --project my-app \
  --repo git@github.com:OWNER/REPO.git \
  --ref main \
  --path packages/app \
  --profile production \
  --submit testflight
```

Result: an iOS IPA built with `eas build --local` on your Mac worker instead of Expo's remote build infrastructure.

## Why Engineers Use It

- **Avoid paid remote build minutes.** Keep Expo, but move iOS build compute onto your hardware.
- **Works with real Expo apps.** The worker runs install, checks, prebuild, local EAS build, and optional EAS Submit.
- **Good for frequent iteration.** Build as often as your Mac can handle while testing app binaries on devices.
- **Drop-in app setup.** `npm run setup` creates `.expofacto/config.yml`, `.expofacto/secrets.env`, and deploy scripts.
- **Plain infrastructure.** A Node controller, a polling worker, SQLite job state, and normal Git refs.

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

The postinstall step adds safe ignore rules for local secrets and artifacts, creates `.expofacto/deploy.sh`, and adds package scripts when they do not already exist.

Run setup:

```bash
npm run setup
```

Setup creates:

- `.expofacto/config.yml`
- `.expofacto/secrets.env`
- `.expofacto/deploy.sh`

Fill any missing `FACTO_CONTROLLER_URL`, `FACTO_API_TOKEN`, and `EXPO_TOKEN` values before deploying.

Deploy:

```bash
npm run deploy
```

## Local Controller And Worker

Install dependencies:

```bash
npm install
```

Create local env files:

```bash
npm run setup:local
```

Run the controller:

```bash
FACTO_ENV_FILE=.facto/controller.env npm run dev:controller
```

Run a worker in another terminal:

```bash
FACTO_ENV_FILE=.facto/worker.env npm run dev:worker
```

Open `http://localhost:4100` for the operational status page.

## Compatibility

| Area | Support |
| --- | --- |
| Runtime | Node.js 24+ |
| App platform | iOS |
| App framework | Expo / React Native apps using EAS |
| Build mode | `eas build --local` |
| Submit mode | Optional `eas submit` to TestFlight |
| Worker OS | macOS with Xcode and Apple signing access |
| Package managers | npm by default; generated config can be edited |

## Trust And Package Quality

- TypeScript source with emitted declaration files.
- MIT license.
- CI runs install, typecheck, tests, build, and package preview.
- npm publishes from GitHub Actions with provenance.
- Minimal runtime dependencies: `express` and `yaml`.
- Secrets are loaded from env files and redacted from worker logs.

See [docs/secrets.md](docs/secrets.md) for credential setup and storage.

## Not Included Yet

- Scaleway provisioning.
- `launchd` installation.
- Controller-side encrypted secret storage.
- App Store Connect API key management.
- Warm-build change classification.
