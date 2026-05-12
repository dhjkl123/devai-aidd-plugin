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
INSTALL_ROOT="${INSTALL_ROOT:-$HOME/.config/opencode}"
PLUGIN_DIR="$INSTALL_ROOT/plugins"
TEMPLATE_DIR="$INSTALL_ROOT/templates"

if [ -n "$PROJECT_PATH" ]; then
  if [ ! -d "$PROJECT_PATH" ]; then
    echo "Project path does not exist: $PROJECT_PATH" >&2
    exit 2
  fi

  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

  JS_SOURCE="$REPO_ROOT/dist/devai-aidd-plugin.js"
  GLOBAL_SOURCE="$REPO_ROOT/templates/devai-aidd-plugin.global.jsonc"
  PROJECT_SOURCE="$REPO_ROOT/templates/devai-aidd-plugin.project.jsonc"
  MERGE_SCRIPT="$REPO_ROOT/installer/merge-configs.mjs"

  for path in "$JS_SOURCE" "$GLOBAL_SOURCE" "$PROJECT_SOURCE" "$MERGE_SCRIPT"; do
    if [ ! -f "$path" ]; then
      echo "Required source missing: $path. Run 'npm run build' before re-running with --project-path." >&2
      exit 1
    fi
  done

  RESOLVED_PROJECT="$(cd "$PROJECT_PATH" && pwd)"
  PROJECT_OPENCODE_DIR="$RESOLVED_PROJECT/.opencode"
  PROJECT_PLUGIN_DIR="$PROJECT_OPENCODE_DIR/plugins"
  MERGED_CONFIG_TARGET="$PROJECT_OPENCODE_DIR/devai-aidd-plugin.project.jsonc"

  mkdir -p "$PROJECT_PLUGIN_DIR"

  cp "$JS_SOURCE" "$PROJECT_PLUGIN_DIR/devai-aidd-plugin.js"

  if [ -f "$MERGED_CONFIG_TARGET" ]; then
    echo "Existing project config preserved: $MERGED_CONFIG_TARGET"
  else
    node "$MERGE_SCRIPT" --global "$GLOBAL_SOURCE" --project "$PROJECT_SOURCE" --out "$MERGED_CONFIG_TARGET"
  fi

  echo "Installed DevAI AIDD Plugin (project mode) to $PROJECT_OPENCODE_DIR"
  echo ""
  echo "Next: ensure your opencode.jsonc points to the project-local plugin path."
  echo "Example (at $RESOLVED_PROJECT/opencode.jsonc):"
  echo '  { "plugins": [ { "name": "DevAI AIDD Plugin", "path": ".opencode/plugins/devai-aidd-plugin.js" } ] }'
  exit 0
fi

mkdir -p "$PLUGIN_DIR"
mkdir -p "$TEMPLATE_DIR"

if [ "$LOCAL_MODE" -eq 1 ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

  JS_SOURCE="$REPO_ROOT/dist/devai-aidd-plugin.js"
  GLOBAL_SOURCE="$REPO_ROOT/templates/devai-aidd-plugin.global.jsonc"
  PROJECT_SOURCE="$REPO_ROOT/templates/devai-aidd-plugin.project.jsonc"

  for path in "$JS_SOURCE" "$GLOBAL_SOURCE" "$PROJECT_SOURCE"; do
    if [ ! -f "$path" ]; then
      echo "Local source missing: $path. Run 'npm run build' before re-running with --local." >&2
      exit 1
    fi
  done

  cp "$JS_SOURCE" "$PLUGIN_DIR/devai-aidd-plugin.js"

  if [ ! -f "$INSTALL_ROOT/devai-aidd-plugin.global.jsonc" ]; then
    cp "$GLOBAL_SOURCE" "$INSTALL_ROOT/devai-aidd-plugin.global.jsonc"
  fi

  if [ ! -f "$TEMPLATE_DIR/devai-aidd-plugin.project.jsonc" ]; then
    cp "$PROJECT_SOURCE" "$TEMPLATE_DIR/devai-aidd-plugin.project.jsonc"
  fi

  echo "Installed DevAI AIDD Plugin (local source: $REPO_ROOT) to $INSTALL_ROOT"
  echo "Project override template: $TEMPLATE_DIR/devai-aidd-plugin.project.jsonc"
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
download "devai-aidd-plugin.global.jsonc"
download "devai-aidd-plugin.project.jsonc"
download "manifest.json"
download "checksums.txt"

for file in devai-aidd-plugin.js devai-aidd-plugin.global.jsonc devai-aidd-plugin.project.jsonc manifest.json; do
  expected="$(awk -v name="$file" '$2 == name { print $1 }' "$TEMP_DIR/checksums.txt")"
  actual="$(checksum_file "$TEMP_DIR/$file")"
  if [ "$expected" != "$actual" ]; then
    echo "Checksum mismatch for $file" >&2
    exit 1
  fi
done

cp "$TEMP_DIR/devai-aidd-plugin.js" "$PLUGIN_DIR/devai-aidd-plugin.js"

if [ ! -f "$INSTALL_ROOT/devai-aidd-plugin.global.jsonc" ]; then
  cp "$TEMP_DIR/devai-aidd-plugin.global.jsonc" "$INSTALL_ROOT/devai-aidd-plugin.global.jsonc"
fi

if [ ! -f "$TEMPLATE_DIR/devai-aidd-plugin.project.jsonc" ]; then
  cp "$TEMP_DIR/devai-aidd-plugin.project.jsonc" "$TEMPLATE_DIR/devai-aidd-plugin.project.jsonc"
fi

cp "$TEMP_DIR/manifest.json" "$INSTALL_ROOT/manifest.json"
cp "$TEMP_DIR/checksums.txt" "$INSTALL_ROOT/checksums.txt"

echo "Installed DevAI AIDD Plugin to $INSTALL_ROOT"
echo "Project override template: $TEMPLATE_DIR/devai-aidd-plugin.project.jsonc"
