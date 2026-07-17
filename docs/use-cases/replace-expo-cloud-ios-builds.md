# Replace Expo cloud iOS builds with local Mac workers

Expo Facto replaces the build-compute part of EAS Build for iOS. It does not replace Expo as a framework, Expo credentials, or App Store Connect.

## Before

```bash
eas build --platform ios --profile production
```

This asks Expo's remote infrastructure to build the app.

## After

```bash
npx --package @expofacto/cli expofacto build \
  --platform ios \
  --profile production
```

This queues the build on Expo Facto. A Mac runner then runs:

```bash
npm ci
npm run check
npx expo prebuild --platform ios
npx eas-cli@latest build --platform ios --profile production --local
```

## Why this helps

- Build cost moves from remote build minutes to your Mac hardware.
- The build artifact stays visible in the worker workspace.
- Expo Facto records queued, running, failed, and completed jobs with usage and logs.

## Keep in mind

Expo Facto queues pinned Git commits. Commit and push the app state you want to build; the CLI resolves the current commit to a full pushed SHA before creating the job.
