import path from "node:path";

const CODE_PREFIXES = ["src/", "tests/", "scripts/", "templates/", "installer/", "dist/", "release/"];
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
  while (normalized.startsWith("../")) {
    normalized = normalized.slice(3);
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
