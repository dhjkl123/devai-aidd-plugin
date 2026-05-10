import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Story 4.4 (AC1, AC2): build and release packaging contract.
 *
 * Invariants enforced by this script (kept stable for installer compatibility
 * and regression coverage in tests/regression.test.js):
 *   - Output directories: `release/devai-aidd-guard/versions/<version>/` and
 *     `release/devai-aidd-guard/latest/` MUST contain the SAME 7 published
 *     files with byte-identical SHA-256 hashes plus `manifest.json` and
 *     `checksums.txt`.
 *   - `manifest.json.version === package.json.version`. The directory name
 *     `versions/<version>` MUST match `package.json.version`.
 *   - `checksums.txt` line format: `<sha256>  <name>` (lowercase hash,
 *     two ASCII spaces, file name). This is the input contract for both
 *     `installer/install.ps1` (`-split "\s{2,}", 2`) and `installer/install.sh`
 *     (`awk '$2 == name { print $1 }'`). Changing the format will silently
 *     break end-user installs.
 *   - `checksums.txt` MUST contain a line for `manifest.json` IN ADDITION TO
 *     the 7 published files (8 lines total). Both installer parsers
 *     (install.ps1 line 47, install.sh line 36) verify the integrity of
 *     `manifest.json` against `checksums.txt`. The manifest itself does NOT
 *     self-reference (its `files[]` array still enumerates the 7 published
 *     files only) — the manifest entry lives in `checksums.txt` exclusively
 *     to support the installer integrity check.
 *   - `templates/legacy-opencode-aidd-plugin.json` is INTENTIONALLY EXCLUDED
 *     from release artifacts. The legacy compatibility bridge (Story 4.2,
 *     `src/services/compat/legacy-bridge-service.js`) derives that file at
 *     runtime from the modern project config, so shipping it as a template
 *     would produce a stale baseline. Do not add it back without updating
 *     Story 4.2's bridge ownership semantics.
 *
 * Verify-first / mutate-release-tree-only-after-validation: pre-flight
 * validation runs BEFORE any directory creation or file copy so that a
 * missing source file fails fast with a maintainer-friendly message
 * instead of leaving partial artifacts on disk.
 *
 * Optional override for testability: when the environment variable
 * `RELEASE_TARGET_ROOT` is set to an absolute directory, the script writes
 * `<RELEASE_TARGET_ROOT>/devai-aidd-guard/{latest,versions/<version>}/`
 * instead of `<projectRoot>/release/...`. This lets the regression suite
 * generate fixture release trees inside `os.tmpdir()` without polluting
 * the maintainer's working tree. Source paths still resolve from the
 * project root so the test sandbox does not need to copy `dist/`,
 * `installer/`, and `templates/`.
 */

const projectRoot = process.cwd();
const packageJson = JSON.parse(
  fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"),
);
const version = packageJson.version;

const releaseRootOverride = process.env.RELEASE_TARGET_ROOT;
const releaseRoot = releaseRootOverride
  ? path.join(releaseRootOverride, "devai-aidd-guard")
  : path.join(projectRoot, "release", "devai-aidd-guard");
const versionRoot = path.join(releaseRoot, "versions", version);
const latestRoot = path.join(releaseRoot, "latest");

const filesToPublish = [
  { source: path.join(projectRoot, "dist", "devai-aidd-guard.js"), name: "devai-aidd-guard.js" },
  { source: path.join(projectRoot, "installer", "install.ps1"), name: "install.ps1" },
  { source: path.join(projectRoot, "installer", "install.sh"), name: "install.sh" },
  { source: path.join(projectRoot, "installer", "uninstall.ps1"), name: "uninstall.ps1" },
  { source: path.join(projectRoot, "templates", "devai-aidd-guard.global.jsonc"), name: "devai-aidd-guard.global.jsonc" },
  { source: path.join(projectRoot, "templates", "devai-aidd-guard.project.jsonc"), name: "devai-aidd-guard.project.jsonc" },
  { source: path.join(projectRoot, "templates", "opencode.jsonc.example"), name: "opencode.jsonc.example" },
];

const BUNDLE_ARTIFACT_NAME = "devai-aidd-guard.js";

/**
 * Story 4.4 AC1: pre-flight validation.
 *
 * Confirm every entry in `filesToPublish` exists as a regular file BEFORE
 * any release-tree mutation. The default `fs.copyFileSync` failure path
 * raises ENOENT mid-copy and may leave a partially populated target
 * directory; this validator collects ALL missing files into a single
 * actionable error message ("name + absolute source path") so a maintainer
 * knows exactly what to rebuild or restore.
 *
 * The `npm run build` hint is appended only when the missing-files set
 * contains the bundle artifact (`devai-aidd-guard.js`). The check is by
 * exact file name, not substring, so future additions like
 * `devai-aidd-guard.js.map` cannot trigger a false-positive hint
 * (Story 4.4 R2 MEDIUM-1).
 */
function validatePublishSources() {
  const missing = [];
  const missingNames = new Set();
  for (const file of filesToPublish) {
    let exists = false;
    try {
      const stat = fs.statSync(file.source);
      exists = stat.isFile();
    } catch (error) {
      if (error && error.code !== "ENOENT") {
        throw error;
      }
      exists = false;
    }
    if (!exists) {
      missing.push(`  - ${file.name} (expected at ${file.source})`);
      missingNames.add(file.name);
    }
  }
  if (missing.length > 0) {
    const hint = missingNames.has(BUNDLE_ARTIFACT_NAME)
      ? "\nHint: run `npm run build` before `npm run release` to produce dist/devai-aidd-guard.js."
      : "";
    throw new Error(
      `make-release: cannot package release v${version} because required source files are missing:\n${missing.join("\n")}${hint}`,
    );
  }
}

/**
 * Story 4.4 AC1: cleanup pre-existing release directory contents but
 * preserve the `.gitkeep` placeholder that lives directly under
 * `release/devai-aidd-guard/{latest,versions/<version>}/`. The bare
 * placeholder is the only file these directories track in git; everything
 * else is generated artifact and must be regenerated each release run so
 * that stale files (renamed publish entries, prior-version artifacts)
 * never bleed into the published set.
 *
 * `fs.rmSync(..., { recursive: true })` removes both files AND nested
 * directories. Release artifacts are flat-only by design (no subdirectories
 * inside `latest/` or `versions/<version>/`), so any nested directory under
 * a release target is treated as stale and removed (Story 4.4 R2 LOW-3).
 *
 * Story 4.4 R2 MEDIUM-2: cleanup failures (e.g. Windows file lock or
 * permission error) are wrapped with the failing target path so the
 * maintainer can immediately diagnose which target ended up in an
 * inconsistent state.
 */
function cleanReleaseTarget(targetRoot) {
  if (!fs.existsSync(targetRoot)) {
    return;
  }
  let entries;
  try {
    entries = fs.readdirSync(targetRoot, { withFileTypes: true });
  } catch (error) {
    throw new Error(
      `make-release: cleanup failed for ${targetRoot}: ${error?.message || error}`,
    );
  }
  for (const entry of entries) {
    if (entry.name === ".gitkeep") {
      continue;
    }
    const entryPath = path.join(targetRoot, entry.name);
    try {
      fs.rmSync(entryPath, { recursive: true, force: true });
    } catch (error) {
      throw new Error(
        `make-release: cleanup failed for ${targetRoot} while removing ${entry.name}: ${error?.message || error}`,
      );
    }
  }
}

function copyPublishFiles(targetRoot) {
  fs.mkdirSync(targetRoot, { recursive: true });
  for (const file of filesToPublish) {
    fs.copyFileSync(file.source, path.join(targetRoot, file.name));
  }
}

function sha256(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function writeMetadata(targetRoot) {
  const entries = filesToPublish.map((file) => {
    const publishedPath = path.join(targetRoot, file.name);
    return {
      name: file.name,
      size: fs.statSync(publishedPath).size,
      sha256: sha256(publishedPath),
    };
  });

  const manifest = {
    name: "devai-aidd-guard",
    displayName: "DevAI AIDD Plugin",
    version,
    generatedAt: new Date().toISOString(),
    files: entries,
  };

  // Manifest is written FIRST so we can hash it for inclusion in checksums.txt.
  // Story 4.4 R2 CRITICAL-1: both installers verify manifest.json's integrity
  // by looking up its hash in checksums.txt; without the manifest line, every
  // install attempt would fail at the integrity-check step.
  const manifestPath = path.join(targetRoot, "manifest.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const manifestSha256 = sha256(manifestPath);

  // Story 4.4 AC1/AC2: line format `<sha256>  <name>` (two ASCII spaces).
  // Both installer parsers depend on this. See header comment for details.
  // The manifest line is intentionally appended AFTER the published-file
  // lines and is NOT mirrored into manifest.files (which would create a
  // self-reference; checksum of manifest depends on its own contents).
  const publishedLines = entries.map((entry) => `${entry.sha256}  ${entry.name}`);
  publishedLines.push(`${manifestSha256}  manifest.json`);
  const checksumText = publishedLines.join("\n");
  fs.writeFileSync(path.join(targetRoot, "checksums.txt"), `${checksumText}\n`, "utf8");
}

validatePublishSources();

for (const targetRoot of [versionRoot, latestRoot]) {
  cleanReleaseTarget(targetRoot);
  copyPublishFiles(targetRoot);
  writeMetadata(targetRoot);
}

// Story 4.4 R2-review LOW-6: include the absolute output root in the success
// message so a maintainer who has `RELEASE_TARGET_ROOT` set (intentionally or
// accidentally — e.g. leaked from a shell rc) can immediately see where the
// release tree was written instead of assuming the default
// `release/devai-aidd-guard/`.
console.log(`Release created for version ${version} at ${releaseRoot}`);
