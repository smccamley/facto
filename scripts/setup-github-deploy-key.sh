#!/usr/bin/env bash
set -euo pipefail

KEY_PATH="${FACTO_GITHUB_DEPLOY_KEY_PATH:-$HOME/.ssh/facto_ppl_deploy}"
HOST_ALIAS="${FACTO_GITHUB_HOST_ALIAS:-github.com-facto-ppl}"
SSH_CONFIG="$HOME/.ssh/config"

mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"

if [[ -f "$KEY_PATH" ]]; then
  echo "exists $KEY_PATH"
else
  ssh-keygen -t ed25519 -C "facto-ppl-worker" -f "$KEY_PATH" -N ""
  chmod 600 "$KEY_PATH"
  echo "created $KEY_PATH"
fi

touch "$SSH_CONFIG"
chmod 600 "$SSH_CONFIG"

if grep -q "Host $HOST_ALIAS" "$SSH_CONFIG"; then
  echo "exists SSH host alias $HOST_ALIAS"
else
  cat >> "$SSH_CONFIG" <<EOF

Host $HOST_ALIAS
  HostName github.com
  User git
  IdentityFile $KEY_PATH
  IdentitiesOnly yes
EOF
  echo "added SSH host alias $HOST_ALIAS to $SSH_CONFIG"
fi

cat <<EOF

Add this public key as a read-only deploy key on the PPL GitHub repository:

$(cat "$KEY_PATH.pub")

Then use this repo URL in .facto/worker.env or /opt/facto/secrets/worker.env:

PPL_REPO_URL=git@$HOST_ALIAS:OWNER/REPO.git

Test access with:

ssh -T git@$HOST_ALIAS
EOF
