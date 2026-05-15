const EXPLICIT_RESTART_PATTERNS = [
  /\brestart\b/i,
  /\brerun\b/i,
  /\brun again\b/i,
  /\brestart workflow\b/i,
  /\breselect branch\b/i,
  /\bbranch reselect\b/i,
  /다시 시작/,
  /재실행/,
  /브랜치 다시 선택/,
];

function normalizeRunArguments(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function isExplicitWorkflowRestartIntent(value) {
  const text = String(value || "").trim();
  if (text.length === 0) return false;
  return EXPLICIT_RESTART_PATTERNS.some((pattern) => pattern.test(text));
}

export function buildWorkflowRunKey(workflowContext = {}) {
  const commandName = String(workflowContext.commandName || "").trim().toLowerCase();
  const argumentsText = normalizeRunArguments(workflowContext.arguments);
  return `${commandName}::${argumentsText}`;
}

export function createWorkflowRunRecord({
  workflowContext,
  previousRun = null,
  explicitRestart = false,
  now = new Date().toISOString(),
} = {}) {
  const runKey = buildWorkflowRunKey(workflowContext);
  const reused =
    previousRun &&
    explicitRestart !== true &&
    previousRun.runKey === runKey &&
    previousRun.commandName === workflowContext?.commandName;

  if (reused) {
    return {
      ...previousRun,
      lastDetectedAt: now,
      phase: workflowContext?.phase ?? previousRun.phase ?? "start",
      explicitRestartRequested: false,
    };
  }

  return {
    runId: `workflow-run:${workflowContext?.sessionID ?? "no-session"}:${Date.now().toString(36)}`,
    runKey,
    commandName: workflowContext?.commandName ?? null,
    sessionID: workflowContext?.sessionID ?? null,
    phase: workflowContext?.phase ?? "start",
    status: "active",
    explicitRestartRequested: explicitRestart === true,
    createdAt: now,
    lastDetectedAt: now,
    startup: {
      status: "not-started",
      reason: null,
      terminal: false,
      startupChainId: null,
      resolvedAt: null,
      answers: null,
      resolutionSource: null,
    },
    finalization: {
      status: "not-finalized",
      reason: null,
      terminal: false,
      resolvedAt: null,
    },
    branchDecision: {
      status: "not-evaluated",
      reason: null,
      source: null,
      conclusion: null,
      branchName: null,
      evaluatedAt: null,
    },
  };
}

export function resolveWorkflowRunTransition({ priorState, workflowContext } = {}) {
  const previousRun = priorState?.workflowRunCurrent ?? null;
  const explicitRestart = isExplicitWorkflowRestartIntent(workflowContext?.arguments);
  const nextRun = createWorkflowRunRecord({
    workflowContext,
    previousRun,
    explicitRestart,
  });
  const reused = previousRun?.runId === nextRun.runId;

  return {
    explicitRestart,
    reused,
    reason: reused
      ? "existing-run-reused"
      : explicitRestart
        ? "explicit-restart-requested"
        : previousRun
          ? "workflow-run-replaced"
          : "workflow-run-created",
    previousRun,
    workflowRun: nextRun,
  };
}

export function updateWorkflowRunStartup(workflowRun, patch = {}) {
  if (!workflowRun) return workflowRun ?? null;
  return {
    ...workflowRun,
    startup: {
      ...(workflowRun.startup ?? {}),
      ...patch,
    },
  };
}

export function updateWorkflowRunBranchDecision(workflowRun, patch = {}) {
  if (!workflowRun) return workflowRun ?? null;
  return {
    ...workflowRun,
    branchDecision: {
      ...(workflowRun.branchDecision ?? {}),
      ...patch,
    },
  };
}

export function updateWorkflowRunFinalization(workflowRun, completion = null) {
  if (!workflowRun) return workflowRun ?? null;
  const terminal = completion != null;
  return {
    ...workflowRun,
    status: terminal ? "finalized" : workflowRun.status,
    finalization: {
      ...(workflowRun.finalization ?? {}),
      status: terminal ? "completed" : "not-finalized",
      reason: completion?.reason ?? null,
      terminal,
      resolvedAt: completion?.resolvedAt ?? null,
    },
  };
}

export function describeStartupChainSkip({ workflowRun, state } = {}) {
  if (workflowRun?.finalization?.terminal === true || state?.finalizationCompletion != null) {
    return { skip: true, reason: "workflow-run-finalized" };
  }
  if (workflowRun?.startup?.status === "question-pending") {
    return { skip: true, reason: "startup-question-pending" };
  }
  if (workflowRun?.startup?.terminal === true) {
    return { skip: true, reason: "startup-already-resolved" };
  }
  if (state?.recoveryGate && state.recoveryGate.state !== "resolved") {
    return { skip: true, reason: "startup-recovery-gate-open" };
  }
  return { skip: false, reason: "startup-reentry-allowed" };
}
