/**
 * looks-like-git-command.js
 *
 * Pure helper that detects whether a bash command string is invoking `git`.
 * Used by `tool-execute-before.js` to decide whether to fire the block-until-init
 * guard. Detection is intentionally over-inclusive on shell forms — false
 * positives for non-git commands like `digit`, `gitea`, `magit`, or `gitlab`
 * must be avoided because they would block unrelated work.
 *
 * Patterns handled (TD #2 of tech-spec-strengthen-git-init-proposal):
 *   1. Direct invocation: `git ...`, `& git ...` (PowerShell call operator)
 *   2. Windows absolute path: `C:\Program Files\Git\bin\git.exe ...`
 *   3. cmd /c wrapper: `cmd /c git ...`, `cmd.exe /c git ...`
 *   4. POSIX shell -c wrapper: `bash -c "git ..."`, `pwsh -Command "git ..."`
 *   5. Chained shell: `pwd && git status`, `cd repo; git status`
 *   6. Env-prefix invocation: `GIT_TERMINAL_PROMPT=0 git ...`
 *
 * Returns false for non-string inputs and for tokens that merely contain "git"
 * as a substring without word boundaries.
 */

const DIRECT_PATTERN = /^\s*(?:&\s+)?git\b/;
const WINDOWS_PATH_PATTERN = /^\s*(?:["']?[A-Z]:\\[^"']*?\\)?git(?:\.exe)?(?:["'])?\s/;
const CMD_WRAPPER_PATTERN = /\b(?:cmd|cmd\.exe)\s+\/c\s+(?:&?\s*)?git\b/i;
const SHELL_DASH_C_PATTERN = /\b(?:bash|sh|zsh|pwsh|powershell)\s+(?:-c|-Command)\s+["']?\s*git\b/i;
// Boundary set includes newline (multi-line / heredoc) and `(` (command
// substitution `$(git ...)` / `<(git ...)`). Without these, models could
// emit a heredoc-style multi-line command and bypass the guard entirely.
const CHAINED_SHELL_PATTERN = /(?:^|[\n;&|`(])\s*git\b/;
const ENV_PREFIX_PATTERN = /^\s*(?:[A-Z_][A-Z0-9_]*=\S+\s+)+git\b/;

const PATTERNS = [
  DIRECT_PATTERN,
  WINDOWS_PATH_PATTERN,
  CMD_WRAPPER_PATTERN,
  SHELL_DASH_C_PATTERN,
  CHAINED_SHELL_PATTERN,
  ENV_PREFIX_PATTERN,
];

/**
 * @param {unknown} command
 * @returns {boolean}
 */
export function looksLikeGitCommand(command) {
  if (typeof command !== "string" || command.length === 0) {
    return false;
  }
  for (const pattern of PATTERNS) {
    if (pattern.test(command)) {
      return true;
    }
  }
  return false;
}

export default looksLikeGitCommand;
