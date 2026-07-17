#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FACTO_DIR="$ROOT_DIR/.facto"
CONTROLLER_ENV="$FACTO_DIR/controller.env"
WORKER_ENV="$FACTO_DIR/worker.env"

random_token() {
  openssl rand -hex 32
}

write_if_missing() {
  local path="$1"
  local content="$2"

  if [[ -f "$path" ]]; then
    echo "exists $path"
    return
  fi

  umask 077
  printf "%s\n" "$content" > "$path"
  chmod 600 "$path"
  echo "created $path"
}

mkdir -p "$FACTO_DIR"

API_KEY="$(random_token)"
WORKER_TOKEN="$(random_token)"

write_if_missing "$CONTROLLER_ENV" "EXPOFACTO_API_KEY=$API_KEY
FACTO_WORKER_TOKEN=$WORKER_TOKEN
FACTO_DATABASE_PATH=$FACTO_DIR/controller.sqlite
FACTO_CONTROLLER_PORT=4100"

write_if_missing "$WORKER_ENV" "FACTO_WORKER_TOKEN=$WORKER_TOKEN
FACTO_WORKER_NAME=local-worker
FACTO_WORKSPACE_ROOT=$FACTO_DIR/workspaces

# PPL build-time values. Fill these in before running a real build.
PPL_REPO_URL=git@github.com:OWNER/REPO.git
EXPO_TOKEN=
EXPO_PUBLIC_OPEN_MEMORIES_API_URL=
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=
OPEN_MEMORIES_CLERK_ENV=live

# Prefer App Store Connect API key credentials once configured.
EXPO_ASC_API_KEY_PATH=
EXPO_ASC_KEY_ID=
EXPO_ASC_ISSUER_ID=

# Temporary fallback if using Apple ID auth for the earliest parity test.
EXPO_APPLE_ID=
EXPO_APPLE_APP_SPECIFIC_PASSWORD="

echo
echo "Next:"
echo "  source $CONTROLLER_ENV && npm run dev:controller"
echo "  source $WORKER_ENV && npm run dev:worker"
echo
echo "The files are chmod 600 and ignored by git via .facto/."
