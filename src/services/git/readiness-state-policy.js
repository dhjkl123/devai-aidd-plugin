export const READINESS_UNAVAILABLE_REASON = "readiness-check-unavailable";

export function isReadinessUnavailable(readiness) {
  return readiness?.reason === READINESS_UNAVAILABLE_REASON;
}

export function isAuthoritativeReadiness(readiness) {
  if (!readiness || typeof readiness !== "object" || isReadinessUnavailable(readiness)) {
    return false;
  }

  if (readiness.outcome === "ask" && readiness.reason === "git-not-initialized") {
    return true;
  }

  const details = readiness.details ?? {};
  if (
    readiness.outcome === "allow" &&
    readiness.reason === "repository-ready" &&
    details.isGitRepository === true
  ) {
    return true;
  }

  return (
    readiness.outcome === "allow" &&
    readiness.reason === "readiness-gate-skipped" &&
    details.isGitRepository === true
  );
}

export function resolveReadinessStateUpdate({
  previousReadiness = null,
  nextReadiness = null,
  unavailableFallbackReadiness = null,
} = {}) {
  if (isReadinessUnavailable(nextReadiness)) {
    return {
      readiness: isAuthoritativeReadiness(unavailableFallbackReadiness)
        ? unavailableFallbackReadiness
        : isAuthoritativeReadiness(previousReadiness)
          ? previousReadiness
          : null,
      latestReadinessError: nextReadiness,
    };
  }

  return {
    readiness: nextReadiness ?? null,
    latestReadinessError: null,
  };
}

export function buildAssumedRepositoryReadyReadiness({
  previousReadiness,
  directory,
  hasCommit,
  branch = undefined,
} = {}) {
  const previousDetails = previousReadiness?.details ?? {};
  const nextBranch =
    branch !== undefined
      ? branch
      : typeof previousDetails.branch === "string" && previousDetails.branch.length > 0
        ? previousDetails.branch
        : null;
  return {
    outcome: "allow",
    reason: "repository-ready",
    message: "Repository readiness inferred from a successful git action.",
    details: {
      ...previousDetails,
      directory: typeof directory === "string" ? directory : previousDetails.directory ?? "",
      checkedAt: new Date().toISOString(),
      isGitRepository: true,
      branch: nextBranch,
      hasCommit: hasCommit === true,
      hasRemote: previousDetails.hasRemote === true,
      remoteNames: Array.isArray(previousDetails.remoteNames) ? [...previousDetails.remoteNames] : [],
    },
  };
}
