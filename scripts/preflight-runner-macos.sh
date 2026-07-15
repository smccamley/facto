#!/usr/bin/env bash
set -euo pipefail
shopt -s extglob

MANIFEST=""
VERBOSE=0
CHECK_ONLY=0

usage() {
  cat <<'EOF'
Usage: preflight-runner-macos.sh --manifest docs/runner-toolchain.md [-V|--verbose] [--check-only]

Checks the macOS runner toolchain against the Markdown manifest. Missing tools
are installed where possible; existing tools are left alone unless a required
minimum version fails. macOS and Xcode repairs can take a long time.
EOF
}

log() {
  printf '%s\n' "$*"
}

debug() {
  if [[ "$VERBOSE" == "1" ]]; then
    printf '[preflight] %s\n' "$*"
  fi
}

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

need_value() {
  local option="$1"
  local value="${2:-}"

  if [[ -z "$value" || "$value" == --* ]]; then
    fail "$option requires a value"
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --manifest)
      need_value "$1" "${2:-}"
      MANIFEST="${2:-}"
      shift 2
      ;;
    -V|--verbose)
      VERBOSE=1
      shift
      ;;
    --check-only)
      CHECK_ONLY=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown option: $1"
      ;;
  esac
done

[[ -n "$MANIFEST" ]] || fail "--manifest is required"
[[ -f "$MANIFEST" ]] || fail "Manifest not found: $MANIFEST"

if [[ "$(uname)" != "Darwin" ]]; then
  fail "Facto iOS runners require macOS."
fi

version_number() {
  printf '%s\n' "${1:-}" | sed -E 's/^[^0-9]*//; s/[^0-9.].*$//'
}

version_at_least() {
  local actual
  local required
  local index
  local actual_part
  local required_part

  actual="$(version_number "$1")"
  required="$(version_number "$2")"

  [[ -n "$actual" && -n "$required" ]] || return 1

  IFS='.' read -r -a actual_parts <<< "$actual"
  IFS='.' read -r -a required_parts <<< "$required"

  for ((index = 0; index < ${#required_parts[@]}; index += 1)); do
    actual_part="${actual_parts[$index]:-0}"
    required_part="${required_parts[$index]:-0}"
    actual_part="${actual_part##+(0)}"
    required_part="${required_part##+(0)}"
    actual_part="${actual_part:-0}"
    required_part="${required_part:-0}"

    if ((10#$actual_part > 10#$required_part)); then
      return 0
    fi

    if ((10#$actual_part < 10#$required_part)); then
      return 1
    fi
  done

  return 0
}

extract_manifest_rows() {
  awk '
    /<!-- facto-runner-toolchain:start -->/ { inside = 1; next }
    /<!-- facto-runner-toolchain:end -->/ { inside = 0 }
    inside && /^\|/ {
      if ($0 ~ /^\|[[:space:]]*-+/) next
      if ($0 ~ /^\|[[:space:]]*id[[:space:]]*\|/) next
      print
    }
  ' "$MANIFEST"
}

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

manifest_value() {
  local wanted_id="$1"
  local wanted_column="$2"
  local row
  local id
  local command
  local version
  local manager
  local package_name
  local required

  while IFS= read -r row; do
    IFS='|' read -r _ id command version manager package_name required _ <<< "$row"
    id="$(trim "$id")"

    if [[ "$id" == "$wanted_id" ]]; then
      case "$wanted_column" in
        command) trim "$command" ;;
        version) trim "$version" ;;
        manager) trim "$manager" ;;
        package) trim "$package_name" ;;
        required) trim "$required" ;;
        *) return 1 ;;
      esac
      return 0
    fi
  done < <(extract_manifest_rows)

  return 1
}

prepend_path_once() {
  local path="$1"
  [[ -d "$path" ]] || return 0

  case ":$PATH:" in
    *":$path:"*) ;;
    *) export PATH="$path:$PATH" ;;
  esac
}

append_path_once() {
  local path="$1"
  [[ -d "$path" ]] || return 0

  case ":$PATH:" in
    *":$path:"*) ;;
    *) export PATH="$PATH:$path" ;;
  esac
}

ensure_homebrew() {
  if command -v brew >/dev/null 2>&1; then
    debug "homebrew found at $(command -v brew)"
    return 0
  fi

  append_path_once "/opt/homebrew/bin"
  append_path_once "/usr/local/bin"

  if command -v brew >/dev/null 2>&1; then
    debug "homebrew found at $(command -v brew)"
    return 0
  fi

  [[ "$CHECK_ONLY" == "0" ]] || fail "Homebrew is missing."

  log "Installing Homebrew..."
  NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

  append_path_once "/opt/homebrew/bin"
  append_path_once "/usr/local/bin"
  command -v brew >/dev/null 2>&1 || fail "Homebrew install completed but brew is not on PATH."
}

brew_prefix() {
  brew --prefix "$1" 2>/dev/null || true
}

configure_managed_paths() {
  command -v brew >/dev/null 2>&1 || return 0

  append_path_once "$(brew --prefix)/bin"
  append_path_once "$(brew --prefix)/sbin"
}

run_sudo() {
  if [[ "$(id -u)" == "0" ]]; then
    "$@"
    return $?
  fi

  sudo "$@"
}

brew_install_package() {
  local package_name="$1"

  ensure_homebrew
  configure_managed_paths

  [[ "$CHECK_ONLY" == "0" ]] || return 0

  if brew list --versions "$package_name" >/dev/null 2>&1; then
    debug "$package_name is already installed with Homebrew"
  else
    log "Installing $package_name with Homebrew..."
    brew install "$package_name"
  fi

  configure_managed_paths
}

brew_upgrade_or_install_package() {
  local package_name="$1"

  ensure_homebrew
  configure_managed_paths

  [[ "$CHECK_ONLY" == "0" ]] || return 0

  if brew list --versions "$package_name" >/dev/null 2>&1; then
    log "Upgrading $package_name with Homebrew..."
    brew upgrade "$package_name"
  else
    log "Installing $package_name with Homebrew..."
    brew install "$package_name"
  fi

  configure_managed_paths
}

install_macos_updates() {
  [[ "$CHECK_ONLY" == "0" ]] || return 0

  log "Installing all available macOS software updates. The machine may restart if Apple requires it..."
  run_sudo softwareupdate --install --all --restart
}

install_xcode_command_line_tools() {
  [[ "$CHECK_ONLY" == "0" ]] || return 0

  if xcode-select -p >/dev/null 2>&1; then
    return 0
  fi

  log "Installing Xcode Command Line Tools..."
  touch /tmp/.com.apple.dt.CommandLineTools.installondemand.in-progress

  local label
  label="$(softwareupdate --list 2>/dev/null | awk -F'* ' '/Command Line Tools/ {print $2}' | tail -n 1)"

  if [[ -n "$label" ]]; then
    run_sudo softwareupdate --install "$label"
  else
    xcode-select --install || true
  fi

  rm -f /tmp/.com.apple.dt.CommandLineTools.installondemand.in-progress
}

ensure_xcodes() {
  if command -v xcodes >/dev/null 2>&1; then
    debug "xcodes found at $(command -v xcodes)"
    return 0
  fi

  [[ "$CHECK_ONLY" == "0" ]] || fail "xcodes is missing."

  ensure_homebrew
  configure_managed_paths

  log "Installing xcodes and aria2 with Homebrew..."
  brew install xcodesorg/made/xcodes aria2
  configure_managed_paths

  command -v xcodes >/dev/null 2>&1 || fail "xcodes install completed but xcodes is not on PATH."
}

selected_xcode_developer_dir() {
  xcode-select -p 2>/dev/null || true
}

select_installed_xcode() {
  local required_version="$1"
  local developer_dir
  local app_path

  developer_dir="$(selected_xcode_developer_dir)"

  if [[ "$developer_dir" == *"/Xcode-${required_version}.app/Contents/Developer" || "$developer_dir" == "/Applications/Xcode.app/Contents/Developer" ]]; then
    return 0
  fi

  app_path="/Applications/Xcode-${required_version}.app"

  if [[ ! -d "$app_path" && -d "/Applications/Xcode.app" ]]; then
    app_path="/Applications/Xcode.app"
  fi

  [[ -d "$app_path" ]] || return 1

  log "Selecting $app_path..."
  run_sudo xcode-select -s "$app_path/Contents/Developer"
}

install_or_update_xcode() {
  local required_version="$1"

  [[ "$CHECK_ONLY" == "0" ]] || return 0

  ensure_xcodes

  if [[ -z "${XCODES_USERNAME:-}" ]]; then
    log "XCODES_USERNAME is not set. xcodes may use a saved Apple ID or prompt for credentials."
  fi

  log "Installing Xcode $required_version with xcodes. This can take a long time..."
  xcodes install "$required_version" --select --experimental-unxip || xcodes install "$required_version" --select

  select_installed_xcode "$required_version" || true

  log "Running Xcode first-launch tasks and accepting the license..."
  run_sudo xcodebuild -runFirstLaunch
  run_sudo xcodebuild -license accept
}

require_command_version() {
  local id="$1"
  local command_name
  local required_version
  local manager
  local package_name
  local actual_version
  local version_output

  command_name="$(manifest_value "$id" command)"
  required_version="$(manifest_value "$id" version)"
  manager="$(manifest_value "$id" manager)"
  package_name="$(manifest_value "$id" package)"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    if [[ "$manager" == "homebrew" ]]; then
      brew_install_package "$package_name"
    elif [[ "$manager" == "npm" ]]; then
      require_command_version node
      require_command_version npm
      [[ "$CHECK_ONLY" == "0" ]] || fail "$command_name is missing."
      log "Installing $package_name with npm..."
      npm install -g "$package_name@latest"
    elif [[ "$manager" == "nvm" ]]; then
      fail "$command_name is missing. Run the Facto installer so nvm can install Node.js before preflight."
    else
      fail "$command_name is missing and cannot be installed automatically."
    fi
  fi

  command -v "$command_name" >/dev/null 2>&1 || fail "$command_name is still missing after install."

  if [[ "$required_version" == "present" ]]; then
    if version_output="$(command_version_for_id "$id" "$command_name" 2>&1)"; then
      log "ok $id $version_output"
    else
      debug "$id version check failed: $version_output"
      log "ok $id present"
    fi
    return 0
  fi

  if ! version_output="$(command_version_for_id "$id" "$command_name" 2>&1)"; then
    fail "$id version check failed: $version_output"
  fi

  actual_version="$version_output"

  if version_at_least "$actual_version" "$required_version"; then
    log "ok $id $actual_version"
    return 0
  fi

  if [[ "$manager" == "homebrew" && "$CHECK_ONLY" == "0" ]]; then
    brew_upgrade_or_install_package "$package_name"

    if ! version_output="$(command_version_for_id "$id" "$command_name" 2>&1)"; then
      fail "$id version check failed after installing $package_name: $version_output"
    fi

    actual_version="$version_output"

    if version_at_least "$actual_version" "$required_version"; then
      log "ok $id $actual_version"
      return 0
    fi
  fi

  if [[ "$manager" == "nvm" ]]; then
    fail "$id is $actual_version, expected at least $required_version. Run the Facto installer to activate Node.js 24+ with nvm."
  else
    fail "$id is $actual_version, expected at least $required_version."
  fi
}

command_version_for_id() {
  local id="$1"
  local command_name="$2"

  case "$id" in
    xcodes) "$command_name" version | head -n 1 ;;
    xcodebuild) xcodebuild -version | awk '/Xcode/ {print $2; exit}' ;;
    ios-sdk) xcrun --sdk iphoneos --show-sdk-version ;;
    eas-cli) npm view eas-cli version ;;
    expo-cli) npm view expo version ;;
    *) "$command_name" --version 2>&1 | head -n 1 | sed -E 's/^[^0-9]*//' ;;
  esac
}

require_xcode() {
  local required_version
  local actual_version

  required_version="$(manifest_value xcodebuild version)"
  install_xcode_command_line_tools

  if ! command -v xcodebuild >/dev/null 2>&1; then
    install_or_update_xcode "$required_version"
  fi

  command -v xcodebuild >/dev/null 2>&1 || fail "xcodebuild is still missing after attempting to install Xcode $required_version."

  actual_version="$(xcodebuild -version | awk '/Xcode/ {print $2; exit}')"

  if ! version_at_least "$actual_version" "$required_version"; then
    install_or_update_xcode "$required_version"
    actual_version="$(xcodebuild -version | awk '/Xcode/ {print $2; exit}')"
  fi

  if ! version_at_least "$actual_version" "$required_version"; then
    fail "Xcode is $actual_version after install, expected at least $required_version. Check xcodes output and selected developer directory: $(selected_xcode_developer_dir)"
  fi

  if ! xcodebuild -license check >/dev/null 2>&1; then
    [[ "$CHECK_ONLY" == "0" ]] || fail "Xcode license has not been accepted. Run sudo xcodebuild -license accept."
    log "Accepting Xcode license..."
    run_sudo xcodebuild -license accept
  fi

  log "ok xcodebuild $actual_version"
}

require_github_access() {
  local required_version
  local actual_version
  local ssh_output

  require_command_version gh
  required_version="$(manifest_value github-auth version)"
  actual_version="missing"

  if gh auth status -h github.com >/dev/null 2>&1; then
    actual_version="gh-authenticated"
  elif ssh_output="$(ssh -n -o BatchMode=yes -o StrictHostKeyChecking=accept-new -T git@github.com 2>&1 || true)" && [[ "$ssh_output" == *"successfully authenticated"* ]]; then
    actual_version="ssh-authenticated"
  fi

  if [[ "$actual_version" == "$required_version" || "$actual_version" == "gh-authenticated" || "$actual_version" == "ssh-authenticated" ]]; then
    log "ok github-auth $actual_version"
    return 0
  fi

  fail "GitHub access is not configured. Run gh auth login or configure a deploy key with npm run setup:github-key."
}

require_signing_env() {
  local required_version

  required_version="$(manifest_value app-store-connect-auth version)"

  if [[ -n "${EXPO_ASC_API_KEY_PATH:-}" && -n "${EXPO_ASC_KEY_ID:-}" && -n "${EXPO_ASC_ISSUER_ID:-}" ]]; then
    [[ -f "$EXPO_ASC_API_KEY_PATH" ]] || fail "EXPO_ASC_API_KEY_PATH is set but the file does not exist: $EXPO_ASC_API_KEY_PATH"
    log "ok app-store-connect-auth api-key"
    return 0
  fi

  if [[ -n "${EXPO_APPLE_ID:-}" && -n "${EXPO_APPLE_APP_SPECIFIC_PASSWORD:-}" ]]; then
    log "ok app-store-connect-auth apple-id"
    return 0
  fi

  fail "App Store Connect credentials are missing. Expected $required_version: EXPO_ASC_API_KEY_PATH, EXPO_ASC_KEY_ID, and EXPO_ASC_ISSUER_ID, or Apple ID fallback env vars."
}

require_npx_package_latest() {
  local id="$1"
  local required_version
  local actual_version

  require_command_version node
  require_command_version npm

  required_version="$(manifest_value "$id" version)"
  actual_version="$(npm view "$(manifest_value "$id" package)" version)"

  if version_at_least "$actual_version" "$required_version"; then
    log "ok $id $actual_version"
  else
    fail "$id latest registry version is $actual_version, expected at least $required_version."
  fi
}

run_check_for_id() {
  local id="$1"

  case "$id" in
    macos)
      local required_version
      local actual_version
      required_version="$(manifest_value macos version)"
      actual_version="$(sw_vers -productVersion)"

      if ! version_at_least "$actual_version" "$required_version"; then
        install_macos_updates
        actual_version="$(sw_vers -productVersion)"
      fi

      if ! version_at_least "$actual_version" "$required_version"; then
        fail "macOS is $actual_version, expected at least $required_version after installing available updates."
      fi

      log "ok macos $actual_version"
      ;;
    homebrew)
      ensure_homebrew
      configure_managed_paths
      log "ok homebrew $(brew --version | head -n 1 | sed -E 's/^[^0-9]*//')"
      ;;
    xcodebuild)
      require_xcode
      ;;
    github-auth)
      require_github_access
      ;;
    app-store-connect-auth)
      require_signing_env
      ;;
    eas-cli|expo-cli)
      require_npx_package_latest "$id"
      ;;
    *)
      require_command_version "$id"
      ;;
  esac
}

log "Checking Facto runner toolchain from $MANIFEST"

while IFS= read -r row <&3; do
  IFS='|' read -r _ id _ _ _ _ required _ <<< "$row"
  id="$(trim "$id")"
  required="$(trim "$required")"

  if [[ "$required" == "optional" ]]; then
    debug "Skipping optional manifest item: $id"
    continue
  fi

  if [[ "$required" == "repair" ]]; then
    debug "Skipping repair-only manifest item: $id"
    continue
  fi

  if [[ "$required" == "job" ]]; then
    debug "Skipping job-time manifest item: $id"
    continue
  fi

  run_check_for_id "$id"
done 3< <(extract_manifest_rows)

log "Facto runner preflight complete."
