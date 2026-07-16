# Replace Expo cloud iOS builds with local Mac workers

Expo Facto replaces the build-compute part of EAS Build for iOS. It does not replace Expo as a framework, Expo credentials, or App Store Connect.

## Before

```bash
eas build --platform ios --profile production
```

This asks Expo's remote infrastructure to build the app.

## After

```bash
npx --package @expofacto/cli expofacto build ios \
  --controller-url https://facto.example.com \
  --token "$FACTO_API_TOKEN" \
  --project my-app \
  --repo git@github.com:OWNER/REPO.git \
  --ref main \
  --path packages/app \
  --profile production
```

This queues the build on your controller. A Mac worker then runs:

```bash
npm ci
npm run check
npx expo prebuild --platform ios
npx eas-cli@latest build --platform ios --profile production --local
```

## Why this helps

- Build cost moves from remote build minutes to your Mac hardware.
- The build artifact stays visible in the worker workspace.
- The controller gives you a small operational status page for queued, running, failed, and completed jobs.

## Keep in mind

Expo Facto queues pinned Git commits. Commit and push the app state you want to build; the CLI resolves `--ref` or the configured default ref to a full commit SHA before creating the job.
