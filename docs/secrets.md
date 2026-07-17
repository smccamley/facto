# Expo Facto Env Values

Expo Facto does not put a secrets file in the app repository and does not require runner-specific API keys.

There is one user-facing Expo Facto API key environment variable:

```bash
export EXPOFACTO_API_KEY=facto_bX....qeLA
```

That key can submit jobs, read logs, register runners, and manage Expo Facto account env values.

## Required Value

`EXPO_TOKEN` is required before runners can pick up jobs.

Expo Facto runners use `EXPO_TOKEN` to authenticate EAS CLI when they pull readable EAS environment variables and run `eas build --local`. If `EXPO_TOKEN` has not been saved, build jobs can still be registered, but they wait with a dashboard warning until the token exists.

Save it with the Expo-shaped env command:

```bash
expofacto env:create \
  --name EXPO_TOKEN \
  --value "$EXPO_TOKEN" \
  --environment production \
  --visibility secret
```

Update it:

```bash
expofacto env:update \
  --name EXPO_TOKEN \
  --value "$EXPO_TOKEN" \
  --environment production \
  --visibility secret
```

Delete it:

```bash
expofacto env:delete --name EXPO_TOKEN
```

## What These Commands Manage

`expofacto env:create`, `expofacto env:update`, and `expofacto env:delete` manage Expo Facto account values in the hosted Expo Facto service.

They intentionally copy the EAS command shape so Expo users can switch tools easily, but they do not create, update, or delete Expo EAS environment variables.

## Storage

Values are sent over the hosted API with:

```bash
Authorization: Bearer $EXPOFACTO_API_KEY
```

The hosted service stores values encrypted and only injects the runner job environment values needed to execute a leased job. Values are not written into the app repo and are not printed back by the CLI.

## Repository Access

The runner still needs Git access to clone the app repository. Prefer a read-only deploy key for private repositories.

## References

- Expo programmatic access: https://docs.expo.dev/accounts/programmatic-access/
- Expo local builds: https://docs.expo.dev/build-reference/local-builds/
