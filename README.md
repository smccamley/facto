# Facto

Facto is a small controller, worker, and CLI for running Expo/EAS iOS builds on Mac hardware we control.

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
