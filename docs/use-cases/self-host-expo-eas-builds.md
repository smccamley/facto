# Self-host Expo EAS builds on your own Mac

Use Expo Facto when you want Expo's app workflow but do not want every iOS binary built on Expo's remote build infrastructure.

Expo Facto runs a controller and one or more Mac workers. The CLI submits a build job, the worker checks out the requested Git ref, runs your checks, runs `expo prebuild`, runs `eas build --local`, and stores the IPA path on completion.

## Install in an Expo app

```bash
npm install @expofacto/cli
npm run setup
```

Fill `.expofacto/secrets.env`:

```bash
FACTO_CONTROLLER_URL=http://localhost:4100
FACTO_API_TOKEN=your-controller-token
EXPO_TOKEN=your-expo-token
```

Submit an iOS build:

```bash
npx --package @expofacto/cli expofacto build ios \
  --project my-app \
  --repo git@github.com:OWNER/REPO.git \
  --ref main \
  --path . \
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
