#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname)" != "Darwin" ]]; then
  echo "This worker setup script is intended for macOS." >&2
  exit 1
fi

FACTO_HOME="${FACTO_HOME:-/opt/facto}"
SECRETS_DIR="$FACTO_HOME/secrets"
WORKSPACES_DIR="$FACTO_HOME/workspaces"
WORKER_ENV="$SECRETS_DIR/worker.env"
WORKER_NAME="${FACTO_WORKER_NAME:-$(scutil --get ComputerName 2>/dev/null || hostname)}"

random_token_hint="paste the FACTO_WORKER_TOKEN from the controller env file"

mkdir -p "$SECRETS_DIR" "$WORKSPACES_DIR"
chmod 700 "$SECRETS_DIR"

if [[ -f "$WORKER_ENV" ]]; then
  echo "exists $WORKER_ENV"
else
  umask 077
  cat > "$WORKER_ENV" <<EOF
FACTO_WORKER_TOKEN=$random_token_hint
FACTO_WORKER_NAME=$WORKER_NAME
FACTO_WORKSPACE_ROOT=$WORKSPACES_DIR

PPL_REPO_URL=git@github.com:OWNER/REPO.git
EXPO_TOKEN=
EXPO_PUBLIC_OPEN_MEMORIES_API_URL=
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=
OPEN_MEMORIES_CLERK_ENV=live

EXPO_ASC_API_KEY_PATH=$SECRETS_DIR/AuthKey_XXXXXXXXXX.p8
EXPO_ASC_KEY_ID=
EXPO_ASC_ISSUER_ID=

EXPO_APPLE_ID=
EXPO_APPLE_APP_SPECIFIC_PASSWORD=
EOF
  chmod 600 "$WORKER_ENV"
  echo "created $WORKER_ENV"
fi

cat <<EOF

Fill in $WORKER_ENV, then run:

  FACTO_ENV_FILE=$WORKER_ENV npm run preflight:runner -- --verbose
  FACTO_ENV_FILE=$WORKER_ENV npm run dev:worker

For launchd, point the service at a wrapper that exports FACTO_ENV_FILE=$WORKER_ENV
before starting the built worker.
EOF
