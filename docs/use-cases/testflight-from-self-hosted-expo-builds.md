# Run TestFlight submissions from a self-hosted Expo build pipeline

Expo Facto can submit the IPA after a local iOS build by running EAS Submit from the Mac worker.

## Configure submit

In `.expofacto/config.yml`:

```yaml
ios:
  profile: production
  submit: testflight
```

Or pass it on the command line:

```bash
npx --package @expofacto/cli expofacto build ios \
  --project my-app \
  --repo git@github.com:OWNER/REPO.git \
  --ref main \
  --profile production \
  --submit testflight
```

## Required credentials

The worker needs the same credentials a normal non-interactive EAS Submit flow needs:

- `EXPO_TOKEN`
- Apple Developer Program access
- App Store Connect submission configuration for the Expo project

## What happens

1. The worker builds an IPA with `eas build --local`.
2. The IPA is saved under `.facto/artifacts`.
3. The worker runs `eas submit --platform ios`.
4. App Store Connect processes the uploaded binary for TestFlight.

Apple processing can take time after upload. Expo Facto reports the submit step output from EAS CLI.
