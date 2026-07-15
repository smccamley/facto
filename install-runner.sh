#!/usr/bin/env bash
set -euo pipefail

installer_url="https://raw.githubusercontent.com/smccamley/facto/main/scripts/install-runner.sh"
installer_file="$(mktemp)"

cleanup() {
  rm -f "$installer_file"
}

trap cleanup EXIT

curl -fsSL "$installer_url" -o "$installer_file"
bash "$installer_file" "$@"
