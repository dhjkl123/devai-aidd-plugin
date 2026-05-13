function normalizeConfiguredSkip(runtimeConfig) {
  return runtimeConfig?.readiness?.skipInitAndBaseline !== false;
}

export function resolveReadinessGate({
  runtimeConfig = null,
  workflowPolicy = null,
  workflowName = null,
} = {}) {
  const configuredSkip = normalizeConfiguredSkip(runtimeConfig);

  if (!configuredSkip) {
    return {
      enabled: true,
      configuredSkip,
      overrideApplied: false,
      overrideField: null,
      overrideValue: null,
      workflowName: workflowName ?? null,
    };
  }

  if (workflowPolicy?.branchRequired === true) {
    return {
      enabled: true,
      configuredSkip,
      overrideApplied: true,
      overrideField: "branchRequired",
      overrideValue: true,
      workflowName: workflowName ?? null,
    };
  }

  const finalization = workflowPolicy?.finalization;
  if (
    finalization === "commit-and-push" ||
    finalization === "commit-optional-push"
  ) {
    return {
      enabled: true,
      configuredSkip,
      overrideApplied: true,
      overrideField: "finalization",
      overrideValue: finalization,
      workflowName: workflowName ?? null,
    };
  }

  return {
    enabled: false,
    configuredSkip,
    overrideApplied: false,
    overrideField: null,
    overrideValue: null,
    workflowName: workflowName ?? null,
  };
}
