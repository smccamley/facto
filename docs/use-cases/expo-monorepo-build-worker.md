# Configure Expo Facto for a monorepo Expo app

Expo Facto can build an Expo app inside a monorepo when you run the command from the package that owns the Expo project.

## Example layout

```text
repo/
  package.json
  packages/
    app/
      package.json
      app.json
      eas.json
```

From the app package:

```bash
cd packages/app
```

Expo Facto infers the repo URL from `git remote get-url origin`, resolves the current pushed commit, and sends the app path as `packages/app`.

Add `expofacto.json` only when the app needs Expo Facto-specific prebuild commands:

```json
{
  "build": {
    "ios": {
      "prebuild": ["npm run check"]
    }
  }
}
```

Submit the build:

```bash
npx --package @expofacto/cli expofacto build \
  --platform ios \
  --profile production
```

The worker clones the repo root, then runs install, checks, prebuild, and local EAS build from `packages/app`.

## Tip

Commit and push the app state you want to build. Expo Facto resolves the current commit to a pushed SHA before creating the job.
