/**
 * parse-status-porcelain.js
 *
 * Parser for `git status --short --untracked-files=all` output as consumed by
 * the finish-phase fallback `pluginContext.listChangedFiles()` in src/index.js.
 *
 * Story 3.1 review (MEDIUM): the prior inline parser broke on three real
 * cases git emits in default configurations:
 *
 *   1. `core.quotePath=true` (the default) C-quotes any path containing a
 *      double quote, backslash, or non-ASCII byte. The previous parser fed
 *      `"..."` straight through so the consumer saw quoted paths and the
 *      pathspec on `git add -- <files>` later failed.
 *   2. Rename lines `R  old -> new` were split via `.split(" -> ").at(-1)`
 *      which loses the OLD path entirely. The Story 3.2 commit pathspec
 *      contract needs both paths to stage the rename atomically (old as
 *      deletion, new as addition).
 *   3. Paths with leading whitespace had their leading bytes stripped by
 *      `.trim()` on the payload.
 *
 * This module returns the canonical list of paths (decoded, with renames
 * expanded into both endpoints) so downstream finalization detection sees
 * exactly the files git considers changed.
 */

const STATUS_PREFIX_LENGTH = 3; // 2-char status + 1-char separator
const RENAME_SEPARATOR = " -> ";

const C_ESCAPE_MAP = new Map([
  ["a", ""],
  ["b", "\b"],
  ["f", "\f"],
  ["n", "\n"],
  ["r", "\r"],
  ["t", "\t"],
  ["v", ""],
  ['"', '"'],
  ["\\", "\\"],
  ["'", "'"],
  ["?", "?"],
]);

/**
 * Decode a C-quoted git path token. Git uses `quote.c` rules: wrap with
 * double quotes, escape via backslash, octal `\NNN` for non-ASCII bytes.
 * Octal sequences are byte-level — when `core.quotePath=true` and the path
 * is UTF-8, multiple consecutive octals form a UTF-8 multi-byte sequence.
 *
 * @param {string} token - raw token starting and ending with `"`
 * @returns {string} decoded path
 */
function decodeCQuotedPath(token) {
  // Body without the wrapping double quotes.
  const body = token.slice(1, -1);
  const bytes = [];
  let i = 0;
  while (i < body.length) {
    const ch = body[i];
    if (ch !== "\\") {
      // Regular UTF-16 code unit — push as a UTF-8 byte sequence so the
      // final assembly can decode the whole buffer with TextDecoder.
      const codePoint = body.codePointAt(i);
      if (codePoint > 0xffff) {
        // Surrogate pair — advance two UTF-16 units.
        i += 2;
      } else {
        i += 1;
      }
      // Story 3.1 review (LOW Round 2): a lone UTF-16 surrogate (0xD800-
      // 0xDFFF) cannot be encoded as valid UTF-8. Replace with U+FFFD so
      // the final TextDecoder pass returns a well-formed string.
      if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
        bytes.push(0xef, 0xbf, 0xbd);
        continue;
      }
      // Re-encode as UTF-8 manually so the byte buffer stays uniform.
      if (codePoint < 0x80) {
        bytes.push(codePoint);
      } else if (codePoint < 0x800) {
        bytes.push(0xc0 | (codePoint >> 6));
        bytes.push(0x80 | (codePoint & 0x3f));
      } else if (codePoint < 0x10000) {
        bytes.push(0xe0 | (codePoint >> 12));
        bytes.push(0x80 | ((codePoint >> 6) & 0x3f));
        bytes.push(0x80 | (codePoint & 0x3f));
      } else {
        bytes.push(0xf0 | (codePoint >> 18));
        bytes.push(0x80 | ((codePoint >> 12) & 0x3f));
        bytes.push(0x80 | ((codePoint >> 6) & 0x3f));
        bytes.push(0x80 | (codePoint & 0x3f));
      }
      continue;
    }

    // Escape sequence
    const next = body[i + 1];
    if (next === undefined) {
      // Trailing lone backslash — preserve literally.
      bytes.push(0x5c);
      i += 1;
      continue;
    }

    if (next >= "0" && next <= "7") {
      // Octal escape \NNN (1..3 digits, but git always emits 3).
      let octalDigits = "";
      for (let j = 0; j < 3 && i + 1 + j < body.length; j += 1) {
        const c = body[i + 1 + j];
        if (c >= "0" && c <= "7") {
          octalDigits += c;
        } else {
          break;
        }
      }
      bytes.push(parseInt(octalDigits, 8) & 0xff);
      i += 1 + octalDigits.length;
      continue;
    }

    const mapped = C_ESCAPE_MAP.get(next);
    if (mapped !== undefined) {
      // Push the mapped char's UTF-8 bytes (mapped is always ASCII here).
      bytes.push(mapped.charCodeAt(0));
      i += 2;
      continue;
    }

    // Unknown escape — preserve verbatim.
    bytes.push(0x5c);
    bytes.push(next.charCodeAt(0));
    i += 2;
  }

  return new TextDecoder("utf-8").decode(Uint8Array.from(bytes));
}

/**
 * Parse a single payload (the part after the 3-char status prefix) into one
 * or two paths. Renames yield both endpoints; quoted tokens are decoded.
 *
 * @param {string} payload
 * @returns {string[]} 1-2 paths
 */
function parsePayload(payload) {
  if (typeof payload !== "string" || payload.length === 0) {
    return [];
  }

  // Detect rename. The separator " -> " is reserved by git; if either side
  // contains it literally, git emits the affected side as a C-quoted token,
  // so an unquoted occurrence is unambiguous.
  const sepIndex = findRenameSeparator(payload);
  if (sepIndex !== -1) {
    const fromToken = payload.slice(0, sepIndex);
    const toToken = payload.slice(sepIndex + RENAME_SEPARATOR.length);
    const fromPath = decodePathToken(fromToken);
    const toPath = decodePathToken(toToken);
    const result = [];
    if (fromPath) result.push(fromPath);
    if (toPath) result.push(toPath);
    return result;
  }

  const decoded = decodePathToken(payload);
  return decoded ? [decoded] : [];
}

/**
 * Find the index of the rename separator that sits between the two path
 * tokens. When the OLD side is C-quoted, scanning naively could match a
 * literal " -> " inside the quoted body. Skip quoted regions during the
 * scan so the match is unambiguous.
 *
 * @param {string} payload
 * @returns {number} index or -1
 */
function findRenameSeparator(payload) {
  let i = 0;
  let inQuote = false;
  while (i < payload.length) {
    const ch = payload[i];
    if (inQuote) {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === '"') {
        inQuote = false;
        i += 1;
        continue;
      }
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuote = true;
      i += 1;
      continue;
    }
    if (
      ch === " " &&
      payload.slice(i, i + RENAME_SEPARATOR.length) === RENAME_SEPARATOR
    ) {
      return i;
    }
    i += 1;
  }
  return -1;
}

/**
 * Decode a single path token. Quoted tokens go through C-decoding;
 * unquoted tokens are returned verbatim (preserving leading/trailing
 * spaces and any other byte-significant characters).
 *
 * @param {string} token
 * @returns {string|null}
 */
function decodePathToken(token) {
  if (typeof token !== "string" || token.length === 0) {
    return null;
  }
  if (token.length >= 2 && token.startsWith('"') && token.endsWith('"')) {
    return decodeCQuotedPath(token);
  }
  return token;
}

/**
 * Parse `git status --short --untracked-files=all` stdout into an array of
 * file paths. Renames are expanded to both endpoints. C-quoted paths are
 * decoded back to their actual byte sequences (UTF-8). Empty lines are
 * skipped. Output paths are NOT trimmed — leading/trailing whitespace is
 * meaningful in real filesystems.
 *
 * @param {string} stdout
 * @returns {string[]}
 */
export function parseStatusPorcelainPaths(stdout) {
  const lines = String(stdout || "").split(/\r?\n/);
  const paths = [];
  for (const rawLine of lines) {
    if (rawLine.length === 0) continue;
    // Drop the trailing CR if present (handled by split with /\r?\n/), but
    // do NOT touch leading bytes — they are status flags or path content.
    if (rawLine.length < STATUS_PREFIX_LENGTH) continue;
    const payload = rawLine.slice(STATUS_PREFIX_LENGTH);
    if (payload.length === 0) continue;
    paths.push(...parsePayload(payload));
  }
  return paths;
}
