import path from "node:path";

const CODE_PREFIXES = ["src/", "tests/", "scripts/", "templates/", "installer/", "dist/", "release/"];
const ROOT_LEVEL_CODE_EXTENSIONS = new Set([
  ".html",
  ".htm",
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".jsx",
  ".css",
  ".scss",
  ".json",
]);
const TECHNICAL_DOC_PREFIXES = ["docs/"];
const PLANNING_ARTIFACT_PREFIX = "_bmad-output/planning-artifacts/";
const IMPLEMENTATION_ARTIFACT_PREFIX = "_bmad-output/implementation-artifacts/";
const NON_FINALIZABLE_PREFIXES = [".opencode/", "node_modules/"];

const SINGLETON_ARTIFACT_PATHS = {
  prd: ["_bmad-output/planning-artifacts/prd.md"],
  architecture: ["_bmad-output/planning-artifacts/architecture.md"],
  epics: ["_bmad-output/planning-artifacts/epics.md"],
  "sprint-planning": ["_bmad-output/planning-artifacts/sprint-plan.md"],
  "ux-design": ["_bmad-output/planning-artifacts/ux-design.md"],
  "document-project": ["docs/", "README.md"],
};

function normalizeSeparators(value) {
  return String(value || "").replaceAll("\\", "/");
}

export function normalizeTrackedFilePath(filePath, repositoryRoot = null) {
  if (typeof filePath !== "string" || filePath.trim().length === 0) {
    return null;
  }

  let normalized = filePath.trim();
  if (repositoryRoot && path.isAbsolute(normalized)) {
    normalized = path.relative(repositoryRoot, normalized);
  }

  normalized = normalizeSeparators(normalized).replace(/^\.\//, "");

  // Story 3.1 review (MEDIUM): paths that resolve outside the repository
  // root must NOT be coerced into in-repo-looking relatives. Prior code
  // stripped leading `../` prefixes one slice at a time, which silently
  // converted `/some/other/repo/file.js` into `some/other/repo/file.js`
  // and then classified it as in-repo. Reject any traversal-prefixed
  // result instead so finalization detection only ever considers files
  // genuinely beneath the repository root.
  if (normalized.startsWith("../") || normalized === "..") {
    return null;
  }

  return normalized.length > 0 ? normalized : null;
}

export function classifyTrackedFileKind(normalizedPath) {
  if (typeof normalizedPath !== "string" || normalizedPath.length === 0) {
    return "other";
  }

  if (CODE_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix))) {
    return "code";
  }
  if (!normalizedPath.includes("/")) {
    const dotIndex = normalizedPath.lastIndexOf(".");
    if (dotIndex > 0) {
      const ext = normalizedPath.slice(dotIndex).toLowerCase();
      if (ROOT_LEVEL_CODE_EXTENSIONS.has(ext)) {
        return "code";
      }
    }
  }
  if (
    normalizedPath === "README.md" ||
    normalizedPath === "CHANGELOG.md" ||
    TECHNICAL_DOC_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix)) ||
    normalizedPath.startsWith(IMPLEMENTATION_ARTIFACT_PREFIX)
  ) {
    return "technical-doc";
  }
  if (normalizedPath.startsWith(PLANNING_ARTIFACT_PREFIX)) {
    return "planning-artifact";
  }

  return "other";
}

export function normalizeTrackedFileEntry(file, repositoryRoot = null) {
  const filePath = typeof file === "string" ? file : file?.path;
  const normalizedPath = normalizeTrackedFilePath(filePath, repositoryRoot);
  if (!normalizedPath) {
    return null;
  }

  const providedKind = typeof file === "object" && typeof file?.kind === "string" ? file.kind : null;
  return {
    path: normalizedPath,
    kind: providedKind || classifyTrackedFileKind(normalizedPath),
  };
}

export function mergeTrackedFiles(...sources) {
  const merged = [];
  const seen = new Set();

  for (const source of sources) {
    if (!Array.isArray(source)) {
      continue;
    }
    for (const entry of source) {
      if (!entry || typeof entry.path !== "string") {
        continue;
      }
      if (seen.has(entry.path)) {
        continue;
      }
      seen.add(entry.path);
      merged.push({ path: entry.path, kind: entry.kind || classifyTrackedFileKind(entry.path) });
    }
  }

  return merged;
}

export function splitFinalizableFiles(trackedFiles) {
  const matchedFiles = [];
  const ignoredFiles = [];

  for (const entry of Array.isArray(trackedFiles) ? trackedFiles : []) {
    if (!entry || typeof entry.path !== "string") {
      continue;
    }
    const candidate = { path: entry.path, kind: entry.kind || classifyTrackedFileKind(entry.path) };
    const isIgnoredPrefix = NON_FINALIZABLE_PREFIXES.some((prefix) => candidate.path.startsWith(prefix));
    const isMeaningfulKind =
      candidate.kind === "code" ||
      candidate.kind === "technical-doc" ||
      candidate.kind === "planning-artifact";

    if (isIgnoredPrefix || !isMeaningfulKind) {
      ignoredFiles.push(candidate);
      continue;
    }

    matchedFiles.push(candidate);
  }

  return { matchedFiles, ignoredFiles };
}

export function artifactScopeMatches(artifactKey, files) {
  if (typeof artifactKey !== "string" || artifactKey.length === 0) {
    return true;
  }

  const expectedPaths = SINGLETON_ARTIFACT_PATHS[artifactKey];
  if (!Array.isArray(expectedPaths) || expectedPaths.length === 0) {
    return true;
  }

  const normalizedFiles = Array.isArray(files) ? files : [];
  return normalizedFiles.every((entry) =>
    expectedPaths.some((expectedPath) => entry.path === expectedPath || entry.path.startsWith(expectedPath)),
  );
}

export function summarizeArtifactKinds(files) {
  return [...new Set((Array.isArray(files) ? files : []).map((entry) => entry.kind).filter(Boolean))];
}

// ─────────────────────────────────────────────────────────────────────────────
// Story 3.5: reviewer-facing path scope summary.
// ─────────────────────────────────────────────────────────────────────────────
//
// Story 3.5 requires reviewer-facing approval prompts and audit metadata to
// describe "어떤 파일 범주가 커밋 대상인지" without leaking full absolute paths
// or per-file basenames. The commit proposal already carries the explicit
// `files` list (kept inside the proposal for git pathspec assembly), but the
// approval explanation must surface a coarser, sanitized summary the reviewer
// can map back onto standard `git log -- <path>` queries.
//
// PATH_SCOPE_BUCKETS is the canonical, ordered list of repository path
// prefixes the plugin classifies as finalizable scopes. Buckets are derived
// from the same prefix tables this module already uses for `splitFinalizableFiles`,
// so the contract stays single-sourced — adding a new finalizable prefix
// requires updating this list as well.
//
// Each bucket exposes:
//   - prefix : the standard repo-relative prefix reviewers can paste into
//              `git log -- <prefix>` directly.
//   - label  : a short reviewer-facing identifier (English, kept stable so
//              regression tests can pin it deterministically).
//
// `summarizePathScope` returns a deterministically-ordered array of
// { prefix, label, count } entries — one per bucket that received at least
// one matched file — plus an "other" bucket carrying counts for files whose
// path did not match any known prefix. Per-file basenames are never
// surfaced and the matched file's full path never leaves the proposal.
const PATH_SCOPE_BUCKETS = [
  { prefix: "src/", label: "code/src" },
  { prefix: "tests/", label: "code/tests" },
  { prefix: "scripts/", label: "code/scripts" },
  { prefix: "templates/", label: "code/templates" },
  { prefix: "installer/", label: "code/installer" },
  { prefix: "dist/", label: "code/dist" },
  { prefix: "release/", label: "code/release" },
  { prefix: "docs/", label: "doc/technical" },
  { prefix: PLANNING_ARTIFACT_PREFIX, label: "doc/planning-artifact" },
  { prefix: IMPLEMENTATION_ARTIFACT_PREFIX, label: "doc/implementation-artifact" },
];

const SINGLE_FILE_DOC_BUCKETS = new Map([
  ["README.md", { prefix: "README.md", label: "doc/readme" }],
  ["CHANGELOG.md", { prefix: "CHANGELOG.md", label: "doc/changelog" }],
]);

/**
 * Build a reviewer-facing path-scope summary from a normalized matchedFiles
 * list. Returned entries are ordered to match PATH_SCOPE_BUCKETS so the
 * approval body and audit metadata render deterministically.
 *
 * The summary intentionally drops per-file basenames: reviewers should be
 * able to map each bucket to a `git log -- <prefix>` invocation without the
 * approval prompt ever leaking individual filenames or absolute paths.
 *
 * @param {Array<{ path?: string }> | null} files
 * @returns {Array<{ prefix: string, label: string, count: number }>}
 */
export function summarizePathScope(files) {
  const counts = new Map();

  function increment(bucket) {
    if (!counts.has(bucket.prefix)) {
      counts.set(bucket.prefix, { prefix: bucket.prefix, label: bucket.label, count: 0 });
    }
    counts.get(bucket.prefix).count += 1;
  }

  for (const entry of Array.isArray(files) ? files : []) {
    const filePath = typeof entry === "string" ? entry : entry?.path;
    if (typeof filePath !== "string" || filePath.length === 0) {
      continue;
    }

    const exactBucket = SINGLE_FILE_DOC_BUCKETS.get(filePath);
    if (exactBucket) {
      increment(exactBucket);
      continue;
    }

    const matched = PATH_SCOPE_BUCKETS.find((bucket) =>
      filePath.startsWith(bucket.prefix),
    );
    if (matched) {
      increment(matched);
      continue;
    }

    increment({ prefix: "other", label: "other" });
  }

  // Story 3.5 invariant: ordering is determined by PATH_SCOPE_BUCKETS so that
  // approval-explanation snapshots and audit metadata are stable across
  // arbitrary input orderings.
  const orderedPrefixes = [
    ...PATH_SCOPE_BUCKETS.map((bucket) => bucket.prefix),
    ...[...SINGLE_FILE_DOC_BUCKETS.values()].map((bucket) => bucket.prefix),
    "other",
  ];

  return orderedPrefixes
    .filter((prefix) => counts.has(prefix))
    .map((prefix) => counts.get(prefix));
}
