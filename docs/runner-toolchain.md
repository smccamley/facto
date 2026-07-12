# Facto macOS Runner Toolchain

Last reviewed: 2026-07-12.

This manifest is the source of truth for `scripts/preflight-runner-macos.sh`.
Update the versions here first, then run the preflight before starting a runner.

Sources used for this review:

- Apple Developer Releases: Xcode 26.6 (17F113), released 2026-06-25, and macOS 26.5.2 (25F84), released 2026-06-29.
- Node.js release index: Node.js v24.18.0.
- Homebrew formula API: Git 2.55.0, GitHub CLI 2.96.0, Ruby 4.0.5, CocoaPods 1.17.0, fastlane 2.237.0, Watchman 2026.07.06.00.
- npm registry: npm 12.0.1, eas-cli 20.5.1, expo 57.0.4.

<!-- facto-runner-toolchain:start -->
| id | command | version | manager | package | required |
| --- | --- | --- | --- | --- | --- |
| macos | sw_vers | 26.5.2 | manual | macOS | required |
| homebrew | brew | latest | installer | homebrew | required |
| xcodebuild | xcodebuild | 26.6 | manual | Xcode.app | required |
| ios-sdk | xcrun | 26.6 | manual | Xcode.app | required |
| git | git | 2.55.0 | homebrew | git | required |
| gh | gh | 2.96.0 | homebrew | gh | required |
| github-auth | gh | authenticated | manual | gh-auth-or-ssh-key | required |
| node | node | 24.18.0 | homebrew | node@24 | required |
| npm | npm | 12.0.1 | homebrew | node@24 | required |
| npx | npx | 12.0.1 | homebrew | node@24 | required |
| ruby | ruby | 4.0.5 | homebrew | ruby | required |
| pod | pod | 1.17.0 | homebrew | cocoapods | required |
| fastlane | fastlane | 2.237.0 | homebrew | fastlane | required |
| watchman | watchman | 2026.07.06.00 | homebrew | watchman | required |
| eas-cli | eas | 20.5.1 | npx | eas-cli | required |
| expo-cli | expo | 57.0.4 | npx | expo | required |
| app-store-connect-auth | env | api-key-or-apple-id | manual | Expo ASC env | required |
<!-- facto-runner-toolchain:end -->

Notes:

- Xcode and macOS are verified, not silently installed. They require Apple-controlled downloads, a large install, and often operator credentials. Update them before starting the runner.
- `github-auth` passes when either `gh auth status -h github.com` succeeds or SSH to `git@github.com` reports an authenticated deploy key.
- `app-store-connect-auth` passes with App Store Connect API key env vars or the temporary Apple ID fallback env vars documented in `docs/secrets.md`.
