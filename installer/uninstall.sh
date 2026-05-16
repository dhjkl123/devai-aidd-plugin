#!/usr/bin/env bash
set -euo pipefail

# Operates on the CURRENT WORKING DIRECTORY's .opencode/. Removes:
#   - .opencode/plugins/devai-aidd-plugin.js
#   - .opencode/devai-aidd-plugin.project.jsonc

CWD="$(pwd)"
OPENCODE_DIR="$CWD/.opencode"

if [ ! -d "$OPENCODE_DIR" ]; then
  echo "No .opencode directory in $CWD. Nothing to remove."
  exit 0
fi

PLUGIN_PATH="$OPENCODE_DIR/plugins/devai-aidd-plugin.js"
REMOVED=()

if [ -f "$PLUGIN_PATH" ]; then
  rm -f "$PLUGIN_PATH"
  REMOVED+=("$PLUGIN_PATH")
fi

PROJECT_CONFIG_PATH="$OPENCODE_DIR/devai-aidd-plugin.project.jsonc"
if [ -f "$PROJECT_CONFIG_PATH" ]; then
  rm -f "$PROJECT_CONFIG_PATH"
  REMOVED+=("$PROJECT_CONFIG_PATH")
fi

if [ "${#REMOVED[@]}" -eq 0 ]; then
  echo "No DevAI AIDD Plugin files found under $OPENCODE_DIR."
else
  echo "Removed:"
  for r in "${REMOVED[@]}"; do
    echo "  $r"
  done
fi
