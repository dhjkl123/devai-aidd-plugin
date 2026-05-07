#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-https://<storage-account>.blob.core.windows.net/opencode-plugins/devai-aidd-guard/latest}"
INSTALL_ROOT="${INSTALL_ROOT:-$HOME/.config/opencode}"
PLUGIN_DIR="$INSTALL_ROOT/plugins"
TEMPLATE_DIR="$INSTALL_ROOT/templates"
TEMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

download() {
  curl -fsSL "$BASE_URL/$1" -o "$TEMP_DIR/$1"
}

checksum_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

mkdir -p "$PLUGIN_DIR"
mkdir -p "$TEMPLATE_DIR"

download "devai-aidd-guard.js"
download "devai-aidd-guard.global.jsonc"
download "devai-aidd-guard.project.jsonc"
download "manifest.json"
download "checksums.txt"

for file in devai-aidd-guard.js devai-aidd-guard.global.jsonc devai-aidd-guard.project.jsonc manifest.json; do
  expected="$(awk -v name="$file" '$2 == name { print $1 }' "$TEMP_DIR/checksums.txt")"
  actual="$(checksum_file "$TEMP_DIR/$file")"
  if [ "$expected" != "$actual" ]; then
    echo "Checksum mismatch for $file" >&2
    exit 1
  fi
done

cp "$TEMP_DIR/devai-aidd-guard.js" "$PLUGIN_DIR/devai-aidd-guard.js"

if [ ! -f "$INSTALL_ROOT/devai-aidd-guard.global.jsonc" ]; then
  cp "$TEMP_DIR/devai-aidd-guard.global.jsonc" "$INSTALL_ROOT/devai-aidd-guard.global.jsonc"
fi

if [ ! -f "$TEMPLATE_DIR/devai-aidd-guard.project.jsonc" ]; then
  cp "$TEMP_DIR/devai-aidd-guard.project.jsonc" "$TEMPLATE_DIR/devai-aidd-guard.project.jsonc"
fi

cp "$TEMP_DIR/manifest.json" "$INSTALL_ROOT/manifest.json"
cp "$TEMP_DIR/checksums.txt" "$INSTALL_ROOT/checksums.txt"

echo "Installed DevAI AIDD Guard to $INSTALL_ROOT"
echo "Project override template: $TEMPLATE_DIR/devai-aidd-guard.project.jsonc"
