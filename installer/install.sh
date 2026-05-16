#!/usr/bin/env bash
set -euo pipefail

LOCAL_MODE=0
PROJECT_PATH=""
POSITIONAL=()
while [ $# -gt 0 ]; do
  case "$1" in
    --local)
      LOCAL_MODE=1
      shift
      ;;
    --project-path)
      PROJECT_PATH="${2:-}"
      if [ -z "$PROJECT_PATH" ]; then
        echo "--project-path requires a directory argument" >&2
        exit 2
      fi
      shift 2
      ;;
    --project-path=*)
      PROJECT_PATH="${1#--project-path=}"
      shift
      ;;
    --)
      shift
      while [ $# -gt 0 ]; do POSITIONAL+=("$1"); shift; done
      ;;
    *)
      POSITIONAL+=("$1")
      shift
      ;;
  esac
done
set -- "${POSITIONAL[@]+"${POSITIONAL[@]}"}"

BASE_URL="${1:-https://<storage-account>.blob.core.windows.net/opencode-plugins/devai-aidd-plugin/latest}"

if [ -z "$PROJECT_PATH" ]; then
  PROJECT_PATH="$(pwd)"
fi

if [ ! -d "$PROJECT_PATH" ]; then
  echo "Project path does not exist: $PROJECT_PATH" >&2
  exit 2
fi

RESOLVED_PROJECT="$(cd "$PROJECT_PATH" && pwd)"
PROJECT_OPENCODE_DIR="$RESOLVED_PROJECT/.opencode"
PROJECT_PLUGIN_DIR="$PROJECT_OPENCODE_DIR/plugins"
PLUGIN_TARGET="$PROJECT_PLUGIN_DIR/devai-aidd-plugin.js"
CONFIG_TARGET="$PROJECT_OPENCODE_DIR/devai-aidd-plugin.project.jsonc"

mkdir -p "$PROJECT_PLUGIN_DIR"

if [ "$LOCAL_MODE" -eq 1 ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

  JS_SOURCE="$REPO_ROOT/dist/devai-aidd-plugin.js"
  PROJECT_SOURCE="$REPO_ROOT/dist/devai-aidd-plugin.project.jsonc"

  for path in "$JS_SOURCE" "$PROJECT_SOURCE"; do
    if [ ! -f "$path" ]; then
      echo "Local source missing: $path. Run 'npm run build' before re-running with --local." >&2
      exit 1
    fi
  done

  cp "$JS_SOURCE" "$PLUGIN_TARGET"
  if [ -f "$CONFIG_TARGET" ]; then
    echo "Existing project config preserved: $CONFIG_TARGET"
  else
    cp "$PROJECT_SOURCE" "$CONFIG_TARGET"
  fi

  echo "Installed DevAI AIDD Plugin (project scope, local source) to $PROJECT_OPENCODE_DIR"
  echo ""
  echo "Next: ensure your opencode.jsonc points to the project-local plugin path."
  echo "Example (at $RESOLVED_PROJECT/opencode.jsonc):"
  echo '  { "plugins": [ { "name": "DevAI AIDD Plugin", "path": ".opencode/plugins/devai-aidd-plugin.js" } ] }'
  exit 0
fi

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

download "devai-aidd-plugin.js"
download "devai-aidd-plugin.project.jsonc"
download "manifest.json"
download "checksums.txt"

for file in devai-aidd-plugin.js devai-aidd-plugin.project.jsonc manifest.json; do
  expected="$(awk -v name="$file" '$2 == name { print $1 }' "$TEMP_DIR/checksums.txt")"
  actual="$(checksum_file "$TEMP_DIR/$file")"
  if [ "$expected" != "$actual" ]; then
    echo "Checksum mismatch for $file" >&2
    exit 1
  fi
done

cp "$TEMP_DIR/devai-aidd-plugin.js" "$PLUGIN_TARGET"
if [ -f "$CONFIG_TARGET" ]; then
  echo "Existing project config preserved: $CONFIG_TARGET"
else
  cp "$TEMP_DIR/devai-aidd-plugin.project.jsonc" "$CONFIG_TARGET"
fi

echo "Installed DevAI AIDD Plugin (project scope) to $PROJECT_OPENCODE_DIR"
echo ""
echo "Next: ensure your opencode.jsonc points to the project-local plugin path."
echo "Example (at $RESOLVED_PROJECT/opencode.jsonc):"
echo '  { "plugins": [ { "name": "DevAI AIDD Plugin", "path": ".opencode/plugins/devai-aidd-plugin.js" } ] }'
