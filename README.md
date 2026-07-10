# Facto

Facto is a small controller, worker, and CLI for running Expo/EAS iOS builds on Mac hardware we control.

## App Repo Usage

Install the package in the Expo app repo:

```bash
npm install @expofacto/expofacto
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

## Local MVP

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

## What this first pass does not provide yet

- Scaleway provisioning.
- `launchd` installation.
- Controller-side encrypted secret storage.
- App Store Connect API key management.
- Warm-build change classification.

Those are next after the controller/worker path is exercised against a real Mac build.
