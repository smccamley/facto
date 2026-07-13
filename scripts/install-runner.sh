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
  curl -fsSL https://raw.githubusercontent.com/smccamley/facto/main/scripts/install-runner.sh | bash -s -- --api-key YOUR_FACTO_API_KEY

  export FACTO_API_KEY=YOUR_FACTO_API_KEY
  curl -fsSL https://raw.githubusercontent.com/smccamley/facto/main/scripts/install-runner.sh | bash

Options:
  --api-key <key>          Facto hosted runner API key. Can also be FACTO_API_KEY.
  --service-url <url>      Facto service URL. Can also be FACTO_SERVICE_URL.
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

need_value() {
  local option="$1"
  local value="${2:-}"

  if [[ -z "$value" || "$value" == --* ]]; then
    fail "$option requires a value"
  fi
}

while (($#)); do
  case "$1" in
    --api-key)
      need_value "$1" "${2:-}"
      export FACTO_API_KEY="$2"
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

if [[ -z "${FACTO_API_KEY:-}" ]]; then
  fail "FACTO_API_KEY is required. Pass --api-key or export FACTO_API_KEY before running this installer."
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
    curl -fsSL "$nvm_install_url" | bash
    nvm_script="$NVM_DIR/nvm.sh"
  fi

  if [[ ! -s "$nvm_script" ]]; then
    fail "nvm did not install cleanly."
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
  nvm install "$required_node_major"
  nvm use "$required_node_major" >/dev/null

  if ! has_supported_node; then
    fail "Node.js ${required_node_major}+ and npx are required but were not found after nvm setup."
  fi
}

mkdir -p "$runner_dir"
cd "$runner_dir"
printf "%s\n" "$required_node_major" > .nvmrc

ensure_node

echo "Starting Facto runner from $runner_dir..."
exec npx --yes --package "$cli_package" expofacto start runner "${runner_args[@]}"
