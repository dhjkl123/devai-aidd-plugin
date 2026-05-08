/**
 * redact-approval-fields.js
 *
 * Pure helpers used by the approval explanation layer to keep absolute paths
 * and full remote URLs out of approval body/metadata.
 *
 * Redaction must run during canonical payload construction so that audit,
 * workflow state, and prompt rendering all consume the same sanitized values.
 */

const REMOTE_LIKE_TOKEN = /[/:@]|^https?$/i;

/**
 * Returns a safe branch label or null. Branch names are already produced by the
 * project branch policy as redacted-safe slugs, so we only enforce non-empty +
 * type-string here.
 *
 * @param {unknown} branchName
 * @returns {string | null}
 */
export function redactBranchLabel(branchName) {
  if (typeof branchName !== "string" || branchName.length === 0) {
    return null;
  }
  return branchName;
}

/**
 * Replaces any directory path with a generic safe label. Absolute paths and
 * arbitrary basenames must never reach prompt body or metadata.
 *
 * @param {unknown} _directory
 * @returns {"current working directory"}
 */
export function redactDirectoryLabel(_directory) {
  return "current working directory";
}

/**
 * Returns a safe remote label (remote name only) or null. URLs, paths, and any
 * value containing `:` or `@` are rejected — only short identifiers like
 * `origin` are allowed.
 *
 * @param {unknown} remote
 * @returns {string | null}
 */
export function redactRemoteLabel(remote) {
  if (typeof remote !== "string" || remote.length === 0) {
    return null;
  }
  if (REMOTE_LIKE_TOKEN.test(remote)) {
    return null;
  }
  return remote;
}
