#!/usr/bin/env bash
set -euo pipefail

required_node_major=24
nvm_version="${FACTO_NVM_VERSION:-v0.40.5}"
nvm_install_url="https://raw.githubusercontent.com/nvm-sh/nvm/${nvm_version}/install.sh"
runner_dir="${FACTO_RUNNER_DIR:-$HOME/facto-runner}"
cli_package="${FACTO_CLI_PACKAGE:-@expofacto/cli}"
runner_args=()

usage() {
  cat <<EOF
Usage:
  curl -fsSL https://raw.githubusercontent.com/smccamley/facto/main/install-runner.sh | bash -s -- --api-key EXPOFACTO_API_KEY

  export EXPOFACTO_API_KEY=facto_bX....qeLA
  curl -fsSL https://raw.githubusercontent.com/smccamley/facto/main/install-runner.sh | bash

Options:
  -k, --api-key <key>      Expo Facto API key. Can also be EXPOFACTO_API_KEY.
  --service-url <url>      Facto service URL for development. Defaults to https://expofacto.dev.
  --name <name>            Runner name. Can also be FACTO_RUNNER_NAME.
  --workspace <path>       Workspace root. Can also be FACTO_WORKSPACE_ROOT.
  --poll-interval-ms <ms>  Poll interval. Can also be FACTO_POLL_INTERVAL_MS.
  -V, --verbose            Mirror redacted build output to this terminal.
  -h, --help               Show this help.

Environment:
  FACTO_RUNNER_DIR         Directory for the runner shell. Defaults to ~/facto-runner.
  FACTO_CLI_PACKAGE        npm package to run. Defaults to @expofacto/cli.
EOF
}

fail() {
  echo "install-runner: $*" >&2
  echo >&2
  usage >&2
  exit 1
}

fail_runtime() {
  echo "install-runner: $*" >&2
  exit 1
}

need_value() {
  local option="$1"
  local value="${2:-}"

  if [[ -z "$value" || "$value" == --* ]]; then
    fail "$option requires a value"
  fi
}

while (($#)); do
  case "$1" in
    -k|--api-key)
      need_value "$1" "${2:-}"
      export EXPOFACTO_API_KEY="$2"
      shift 2
      ;;
    --service-url|--url)
      need_value "$1" "${2:-}"
      runner_args+=(--service-url "$2")
      shift 2
      ;;
    --name)
      need_value "$1" "${2:-}"
      runner_args+=(--name "$2")
      shift 2
      ;;
    --workspace)
      need_value "$1" "${2:-}"
      runner_args+=(--workspace "$2")
      shift 2
      ;;
    --poll-interval-ms)
      need_value "$1" "${2:-}"
      runner_args+=(--poll-interval-ms "$2")
      shift 2
      ;;
    -V|--verbose)
      runner_args+=(--verbose)
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "unknown option: $1"
      ;;
  esac
done

if [[ "$(uname)" != "Darwin" ]]; then
  fail "Facto iOS runners require macOS."
fi

if [[ -z "${EXPOFACTO_API_KEY:-}" ]]; then
  fail "EXPOFACTO_API_KEY is required. Pass --api-key or export EXPOFACTO_API_KEY before running this installer."
fi

node_major() {
  node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || true
}

has_supported_node() {
  local major
  major="$(node_major)"

  [[ "$major" =~ ^[0-9]+$ ]] && ((major >= required_node_major)) && command -v npx >/dev/null 2>&1
}

load_or_install_nvm() {
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  local nvm_script
  local candidates=(
    "$NVM_DIR/nvm.sh"
    "$HOME/.nvm/nvm.sh"
    "/opt/homebrew/opt/nvm/nvm.sh"
    "/usr/local/opt/nvm/nvm.sh"
  )

  for candidate in "${candidates[@]}"; do
    if [[ -s "$candidate" ]]; then
      nvm_script="$candidate"
      break
    fi
  done

  if [[ -z "${nvm_script:-}" ]]; then
    command -v curl >/dev/null 2>&1 || fail "curl is required to install nvm."
    echo "Installing nvm ${nvm_version}..."
    curl -fsSL "$nvm_install_url" | bash || fail_runtime "Could not install nvm. Check your internet connection and rerun this installer."
    nvm_script="$NVM_DIR/nvm.sh"
  fi

  if [[ ! -s "$nvm_script" ]]; then
    fail_runtime "nvm did not install cleanly at $nvm_script."
  fi

  # shellcheck source=/dev/null
  . "$nvm_script"
}

ensure_node() {
  if has_supported_node; then
    return
  fi

  load_or_install_nvm
  echo "Installing Node.js ${required_node_major} with nvm..."
  nvm install "$required_node_major" || fail_runtime "Could not install Node.js ${required_node_major} with nvm."
  nvm use "$required_node_major" >/dev/null || fail_runtime "Could not activate Node.js ${required_node_major} with nvm."

  if ! has_supported_node; then
    fail_runtime "Node.js ${required_node_major}+ and npx are required but were not found after nvm setup."
  fi
}

mkdir -p "$runner_dir" || fail_runtime "Could not create runner directory: $runner_dir"
cd "$runner_dir" || fail_runtime "Could not enter runner directory: $runner_dir"
printf "%s\n" "$required_node_major" > .nvmrc || fail_runtime "Could not write $runner_dir/.nvmrc"

ensure_node

echo "Starting Facto runner from $runner_dir..."
runner_command=(npx --yes --package "$cli_package" expofacto start runner)

if ((${#runner_args[@]})); then
  runner_command=("${runner_command[@]}" "${runner_args[@]}")
fi

exec "${runner_command[@]}"
