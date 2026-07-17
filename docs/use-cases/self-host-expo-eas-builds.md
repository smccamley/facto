# Self-host Expo EAS builds on your own Mac

Use Expo Facto when you want Expo's app workflow but do not want every iOS binary built on Expo's remote build infrastructure.

Expo Facto runs a hosted job queue and one or more Mac runners. The CLI submits a build job to Expo Facto, the runner checks out the requested Git ref, pulls readable EAS environment variables, runs your checks, runs `expo prebuild`, runs `eas build --local`, and stores the IPA path on completion.

Before queueing, the CLI resolves the requested Git ref to a full pushed commit SHA. The worker validates `git`, `npm`, `npx`, and `npx --package eas-cli@latest eas` before checkout so missing tools fail early with actionable logs.

## Install in an Expo app

```bash
npm install @expofacto/cli
npm run setup
```

Export the Expo Facto API key in your shell or CI environment:

```bash
EXPOFACTO_API_KEY=facto_bX....qeLA
```

Submit an iOS build:

```bash
npx --package @expofacto/cli expofacto build \
  --platform ios \
  --profile production
```

## Good fit

- You already use Expo and EAS.
- You have Mac hardware with Xcode available.
- Your team runs enough iOS builds that remote build minutes are the expensive part.
- You are comfortable operating a small build worker.

## Not a fit

- You need Android support today.
- You need hosted Mac capacity instead of operating your own.
- You want to avoid all Expo services. Expo Facto still uses Expo auth, credentials, and EAS local build behavior.
