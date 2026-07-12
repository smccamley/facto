# Expo Facto

Starting now, Expo is the recommended way to build native apps for good reason: it is awesome.

What is not awesome is building every project and app binary on Expo's cloud infrastructure. It can get expensive fast, especially for vibe coders who want to build, deploy, and see the result on a phone instantly. Make a change, run a build. Make another change, run another build. The meter keeps spinning.

Expo Facto is a drop-in path for the expensive part of the Expo build flow: run unlimited iOS builds on your own Mac infrastructure while keeping the Expo developer experience you already like.

✨ Build native apps with Expo  
🏗️ Run iOS builds on Macs you control  
💸 Stop paying cloud-build prices for every tiny iteration  
📱 Ship binaries to your phone as often as you want  
🔁 Keep the workflow simple enough for real projects and fast experiments

## Why Expo Facto?

- **Unlimited builds on your hardware.** Use your own Mac instead of metered cloud infrastructure.
- **Designed for Expo apps.** Keep the project shape, scripts, and Expo/EAS mental model.
- **A small CLI, controller, and worker.** No giant platform migration before you can try it.
- **Fast local iteration.** Great for frequent app binary builds while you are still figuring things out.
- **Drop-in setup.** Install the package, run setup, fill in secrets, deploy.

## Quick Start

Install Expo Facto in your Expo app repo:

```bash
npm install @expofacto/cli
```

Install creates `.expofacto/deploy.sh`, adds safe ignore rules for local secrets and artifacts, and adds package scripts when they do not already exist.

Run setup:

```bash
npm run setup
```

Setup creates:

- `.expofacto/config.yml`
- `.expofacto/secrets.env`
- `.expofacto/deploy.sh`

It copies known values from the shell, `.env`, or `.env.local` into `.expofacto/secrets.env`. Fill any missing `FACTO_CONTROLLER_URL`, `FACTO_API_TOKEN`, and `EXPO_TOKEN` values before deploying.

Deploy:

```bash
npm run deploy
```

You can also run the CLI directly:

```bash
npx expofacto build ios
```

## Local Development

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

Create a job:

```bash
npm run facto -- build ios \
  --controller-url http://localhost:4100 \
  --token dev-api-token \
  --project ppl \
  --repo git@github.com:OWNER/REPO.git \
  --ref main \
  --path packages/ppl \
  --profile production \
  --submit testflight
```

Open `http://localhost:4100` for the operational status page.

See [docs/secrets.md](docs/secrets.md) for credential setup and storage.

## Not Included Yet

- Scaleway provisioning.
- `launchd` installation.
- Controller-side encrypted secret storage.
- App Store Connect API key management.
- Warm-build change classification.

Those are next after the controller/worker path is exercised against a real Mac build.
