# Configure Expo Facto for a monorepo Expo app

Expo Facto can build an Expo app inside a monorepo as long as the app path points at the package that owns the Expo project.

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

Set the app path in `.expofacto/config.yml`:

```yaml
repo:
  provider: github
  url: "git@github.com:OWNER/REPO.git"
  defaultRef: "main"
app:
  path: "packages/app"
  packageManager: "npm"
checks:
  - npm run check
```

Submit the build:

```bash
npx expofacto build ios \
  --project app \
  --repo git@github.com:OWNER/REPO.git \
  --ref main \
  --path packages/app \
  --profile production
```

The worker clones the repo root, then runs install, checks, prebuild, and local EAS build from `packages/app`.

## Tip

Pass an exact commit SHA with `--ref` when you need to prove which source was packaged.
