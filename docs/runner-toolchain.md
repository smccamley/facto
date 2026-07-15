# Facto macOS Runner Toolchain

Last reviewed: 2026-07-12.

This manifest is the source of truth for `scripts/preflight-runner-macos.sh`.
Update the versions here first, then run the preflight before starting a runner.

Sources used for this review:

- Apple Developer Releases: Xcode 26.6 (17F113), released 2026-06-25, and macOS 26.5.2 (25F84), released 2026-06-29.
- Node.js release index: Node.js v24.18.0.
- Homebrew formula API: Git 2.55.0, GitHub CLI 2.96.0, Ruby 4.0.5, CocoaPods 1.17.0, fastlane 2.237.0, Watchman 2026.07.06.00, xcodes 2.0.3, aria2 1.37.0.
- npm registry: npm 12.0.1, eas-cli 20.5.1, expo 57.0.4.
- XcodesOrg/xcodes README: `xcodes install <version>` supports Apple credentials through `XCODES_USERNAME` and `XCODES_PASSWORD`.

<!-- facto-runner-toolchain:start -->
| id | command | version | manager | package | required |
| --- | --- | --- | --- | --- | --- |
| macos | sw_vers | 26.5.2 | softwareupdate | macOS | required |
| homebrew | brew | latest | installer | homebrew | required |
| xcodes | xcodes | 2.0.3 | homebrew | xcodesorg/made/xcodes | repair |
| aria2 | aria2c | 1.37.0 | homebrew | aria2 | repair |
| xcodebuild | xcodebuild | 26.6 | xcodes | Xcode.app | required |
| ios-sdk | xcrun | present | xcodes | Xcode.app | required |
| git | git | present | homebrew | git | required |
| gh | gh | present | homebrew | gh | required |
| github-auth | gh | authenticated | manual | gh-auth-or-ssh-key | required |
| node | node | 24.0.0 | nvm | node | required |
| npm | npm | present | nvm | npm | required |
| npx | npx | present | nvm | npx | required |
| ruby | ruby | present | homebrew | ruby | required |
| pod | pod | present | homebrew | cocoapods | required |
| fastlane | fastlane | present | homebrew | fastlane | required |
| watchman | watchman | present | homebrew | watchman | required |
| eas-cli | eas | 20.5.1 | npx | eas-cli | job |
| expo-cli | expo | 57.0.4 | npx | expo | job |
| app-store-connect-auth | env | api-key-or-apple-id | manual | Expo ASC env | job |
<!-- facto-runner-toolchain:end -->

Notes:

- macOS updates are installed with `softwareupdate --install --all --restart` only when the runner is below the manifest version.
- Homebrew tools are installed when missing, but existing tools marked `present` are not upgraded during runner startup.
- `xcodes` and `aria2` are repair-only dependencies. They are installed only when Xcode must be installed or upgraded.
- Xcode is installed with `xcodes install <version> --select` only when the selected Xcode is missing or below the manifest version. For unattended installs, set `XCODES_USERNAME` and `XCODES_PASSWORD`; otherwise `xcodes` may use saved Keychain credentials or prompt interactively.
- `job` entries are checked when a build or submit job actually needs them, not before the idle runner comes online.
- `github-auth` passes when either `gh auth status -h github.com` succeeds or SSH to `git@github.com` reports an authenticated deploy key.
- `app-store-connect-auth` is a job-time check. It passes with App Store Connect API key env vars or the temporary Apple ID fallback env vars documented in `docs/secrets.md`.
