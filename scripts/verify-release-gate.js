#!/usr/bin/env node
/**
 * scripts/verify-release-gate.js
 *
 * AC9b/AC9c: release-gate verification. Checks that the current
 * `package.json` version is a valid SemVer, is at least one MAJOR ahead of a
 * baseline version, and that `CHANGELOG.md` contains a `## [<version>]`
 * section that includes a `### BREAKING CHANGES` subsection.
 *
 * Usage:
 *   node scripts/verify-release-gate.js
 *     Compares against `git show origin/main:package.json` (or master) and
 *     fails if no remote baseline can be read (in CI or pre-merge).
 *
 *   node scripts/verify-release-gate.js --from <baseSha>
 *     Compares against the version recorded in `package.json` at the given
 *     commit. Use this when CI passes the merge-base SHA explicitly.
 *
 *   node scripts/verify-release-gate.js --baseline <X.Y.Z>
 *     Skips git lookup; compares against the literal SemVer provided.
 *
 * Exits 0 on success and 1 on any failure with a single human-readable
 * stderr message describing the cause.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const projectRoot = process.cwd();

function readPackageVersionFromDisk() {
  const text = fs.readFileSync(path.join(projectRoot, "package.json"), "utf8");
  const json = JSON.parse(text);
  if (typeof json.version !== "string") {
    throw new Error("package.json: version field is missing or not a string");
  }
  return json.version;
}

function tryGitShowVersion(ref) {
  try {
    const text = execFileSync("git", ["show", `${ref}:package.json`], {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
    }).toString();
    const json = JSON.parse(text);
    if (typeof json.version === "string") {
      return json.version;
    }
    return null;
  } catch {
    return null;
  }
}

function parseSemver(value) {
  const match = String(value || "").match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) {
    return null;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] || null,
  };
}

function fail(message) {
  process.stderr.write(`release gate failed: ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { from: null, baseline: null };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--from" && i + 1 < argv.length) {
      args.from = argv[++i];
    } else if (arg === "--baseline" && i + 1 < argv.length) {
      args.baseline = argv[++i];
    }
  }
  return args;
}

function resolveBaseline(args) {
  if (args.baseline) {
    return { source: `--baseline ${args.baseline}`, version: args.baseline };
  }
  if (args.from) {
    const version = tryGitShowVersion(args.from);
    if (!version) {
      fail(`could not read package.json version from --from ref "${args.from}"`);
    }
    return { source: `--from ${args.from}`, version };
  }
  for (const ref of ["origin/main", "main", "origin/master", "master"]) {
    const version = tryGitShowVersion(ref);
    if (version) {
      return { source: ref, version };
    }
  }
  fail(
    "could not determine baseline version (tried origin/main, main, origin/master, master). " +
      "Pass --from <sha> or --baseline <X.Y.Z> explicitly.",
  );
  return null;
}

function readChangelog() {
  const text = fs.readFileSync(path.join(projectRoot, "CHANGELOG.md"), "utf8");
  return text;
}

function findVersionSection(changelog, version) {
  const lines = changelog.split(/\r?\n/);
  const headerPattern = new RegExp(
    `^##\\s+\\[${version.replace(/\./g, "\\.")}\\]`,
  );
  let startIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (headerPattern.test(lines[i])) {
      startIndex = i;
      break;
    }
  }
  if (startIndex === -1) {
    return null;
  }
  let endIndex = lines.length;
  for (let i = startIndex + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) {
      endIndex = i;
      break;
    }
  }
  return lines.slice(startIndex, endIndex);
}

function sectionHasBreakingChanges(sectionLines) {
  return sectionLines.some((line) => /^###\s+BREAKING CHANGES/.test(line));
}

function main() {
  const args = parseArgs(process.argv);
  const currentVersion = readPackageVersionFromDisk();
  const currentSemver = parseSemver(currentVersion);
  if (!currentSemver) {
    fail(`package.json version (${currentVersion}) is not a valid SemVer`);
  }

  const baseline = resolveBaseline(args);
  const baselineSemver = parseSemver(baseline.version);
  if (!baselineSemver) {
    fail(`baseline version (${baseline.version} from ${baseline.source}) is not a valid SemVer`);
  }

  if (currentSemver.major <= baselineSemver.major) {
    fail(
      `package.json version (${currentVersion}) is not a MAJOR bump over baseline (${baseline.version} from ${baseline.source}).`,
    );
  }

  const changelog = readChangelog();
  const section = findVersionSection(changelog, currentVersion);
  if (!section) {
    fail(`CHANGELOG.md is missing a "## [${currentVersion}]" section header`);
  }
  if (!sectionHasBreakingChanges(section)) {
    fail(
      `CHANGELOG.md "## [${currentVersion}]" section has no "### BREAKING CHANGES" subsection`,
    );
  }

  process.stdout.write(`release gate ok: ${currentVersion}\n`);
  process.exit(0);
}

main();
