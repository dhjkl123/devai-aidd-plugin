import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { publishNextPlannedAction } from "../approval/publish-next-planned-action.js";
import { buildCommitAction, executeCommit } from "./commit-service.js";
import { buildPushAction, executePush } from "./push-service.js";
import {
  buildInitAction,
  executeInit,
  DEFAULT_GITIGNORE_LINES,
} from "./init-service.js";
import { buildBaselineCommitProposal } from "./build-init-proposal.js";
import { checkRepositoryReadiness } from "./check-repository-readiness.js";
import { planBranchProposal } from "./plan-branch-proposal.js";

/**
 * strengthen-approval-prompt-instructions follow-up: normalize a raw user
 * answer string (e.g. "Add to .gitignore and Commit (Recommended)") into the
 * same lowercase token shape used by `permission-asked-aliases.js`.
 *
 * Mirrors the steps in `native-event.js:normalizeAnswerKey` so this module
 * does not have to import the hook.
 */
function normalizeUserAnswer(answer) {
  if (typeof answer !== "string") return "";
  return answer
    .toLowerCase()
    .replace(/\s*\(.*\)\s*$/, "")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/[^a-z0-9-]+/g, " ")
    .trim();
}

/**
 * Append unique .gitignore rules to the project's `.gitignore`, creating the
 * file if it does not exist. Returns true when at least one rule was newly
 * written; false otherwise. Best-effort: IO errors are swallowed and surfaced
 * via the audit channel so the commit path can still proceed (the user
 * explicitly accepted that risk by picking "Commit Anyway" if this fails).
 */
async function appendGitignoreRules(directory, rules, audit) {
  if (typeof directory !== "string" || directory.length === 0) return false;
  if (!Array.isArray(rules) || rules.length === 0) return false;
  const target = join(directory, ".gitignore");
  let existing = "";
  try {
    if (existsSync(target)) {
      existing = readFileSync(target, "utf8");
    }
  } catch (error) {
    if (audit) {
      try {
        await audit.info("init.gitignore.read.failed", {
          event: "init.gitignore.read.failed",
          timestamp: new Date().toISOString(),
          workflow: null,
          command: null,
          sessionID: null,
          outcome: "skip",
          details: { reason: "readFileSync-threw", error: error?.message ?? String(error) },
        });
      } catch {
        // best-effort
      }
    }
    existing = "";
  }
  const existingLines = new Set(
    existing
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
  );
  const additions = rules.filter((rule) => !existingLines.has(rule));
  if (additions.length === 0) return false;
  const separator = existing.length === 0 || existing.endsWith("\n") ? "" : "\n";
  const block =
    (existing.length === 0
      ? ""
      : "# Added by devai-aidd-plugin to shield sensitive paths from the baseline commit\n");
  const body = existing + separator + block + additions.join("\n") + "\n";
  try {
    writeFileSync(target, body, "utf8");
  } catch (error) {
    if (audit) {
      try {
        await audit.info("init.gitignore.append.failed", {
          event: "init.gitignore.append.failed",
          timestamp: new Date().toISOString(),
          workflow: null,
          command: null,
          sessionID: null,
          outcome: "skip",
          details: { reason: "writeFileSync-threw", error: error?.message ?? String(error) },
        });
      } catch {
        // best-effort
      }
    }
    return false;
  }
  return true;
}

function buildRepositorySnapshot(state) {
  const details = state?.readiness?.details ?? {};
  if (!state?.readiness || typeof details !== "object") {
    return null;
  }

  return {
    repositoryReady: details.isGitRepository === true,
    headBranch: typeof details.branch === "string" ? details.branch : null,
    hasRemote: details.hasRemote === true,
    remoteNames: Array.isArray(details.remoteNames) ? [...details.remoteNames] : [],
  };
}

function buildWorkflowContext(sessionID, approvalRequest, extras = {}) {
  return {
    sessionID,
    commandName: approvalRequest.command ?? approvalRequest.workflow ?? null,
    phase: approvalRequest.phase ?? "finish",
    // Story 3.4: thread the deterministic actionId and finalization mode
    // into the executor so `git.action.executed` carries the same correlation
    // axes as `approval.requested` / `approval.resolved`. The executor reads
    // these as optional `workflowContext` fields, so passing them here keeps
    // the executor signature stable.
    actionId: approvalRequest.actionId ?? null,
    finalizationMode: extras.finalizationMode ?? null,
  };
}

function resolveWorkflowPolicy(pluginContext, workflowContext) {
  const resolvedPolicy = pluginContext?.resolvePolicy?.(workflowContext);
  return resolvedPolicy?.outcome === "allow" ? resolvedPolicy.details?.policy ?? null : null;
}

function buildPushCorrelationId(sessionID, remoteName, branchName) {
  // Suffix with timestamp so retry attempts get distinct correlationIds
  // (audit timelines for retry collisions otherwise overwrite each other).
  const ts = Date.now().toString(36);
  return `push:${sessionID}:${remoteName}:${branchName}:${ts}`;
}

function buildPushProposal({ sessionID, workflowPolicy, repositorySnapshot, observedState }) {
  const finalizationMode = workflowPolicy?.finalization;
  if (
    finalizationMode !== "commit-and-push" &&
    finalizationMode !== "commit-optional-push"
  ) {
    return null;
  }

  const hasRemote =
    observedState?.hasRemote === true || repositorySnapshot?.hasRemote === true;
  if (!hasRemote) {
    return null;
  }

  const remoteName = Array.isArray(repositorySnapshot?.remoteNames)
    ? repositorySnapshot.remoteNames.find(
        (name) => typeof name === "string" && name.length > 0,
      ) ?? null
    : null;
  const branchName =
    typeof observedState?.headBranch === "string" && observedState.headBranch.length > 0
      ? observedState.headBranch
      : typeof repositorySnapshot?.headBranch === "string" && repositorySnapshot.headBranch.length > 0
        ? repositorySnapshot.headBranch
        : null;

  if (!remoteName || !branchName) {
    return null;
  }

  return buildPushAction({
    remoteName,
    branchName,
    targetBranch: branchName,
    correlationId: buildPushCorrelationId(sessionID, remoteName, branchName),
  });
}

async function publishPushApprovalIfNeeded({
  workflowState,
  sessionID,
  approvalRequest,
  pluginContext,
  audit,
  repositorySnapshot,
  observedState,
}) {
  const workflowContext = buildWorkflowContext(sessionID, approvalRequest);
  const workflowPolicy = resolveWorkflowPolicy(pluginContext, workflowContext);
  const pushProposal = buildPushProposal({
    sessionID,
    workflowPolicy,
    repositorySnapshot,
    observedState,
  });
  const nextState = workflowState.get(sessionID) ?? {};

  workflowState.set(sessionID, {
    ...nextState,
    commitProposal: null,
    pushProposal,
  });

  if (!pushProposal) {
    return;
  }

  if (audit) {
    // Audit is best-effort (per evaluate-workflow-finalization pattern). A
    // throwing logger must NOT prevent publishNextPlannedAction from running,
    // otherwise pushProposal sits in state without the user ever seeing the
    // approval prompt.
    try {
      await audit.info("git.action.planned", {
        event: "git.action.planned",
        timestamp: new Date().toISOString(),
        workflow: workflowContext.commandName,
        command: workflowContext.commandName,
        sessionID,
        outcome: "allow",
        details: {
          kind: "push",
          action: "push",
          requiresApproval: true,
          actionId: pushProposal.correlationId ?? null,
          correlationId: pushProposal.correlationId ?? null,
          phase: workflowContext.phase ?? null,
          finalizationMode: workflowPolicy?.finalization ?? null,
          remoteName: pushProposal.remoteName,
          branchName: pushProposal.branchName,
        },
      });
    } catch {
      // Audit failure is itself best-effort.
    }
  }

  await publishNextPlannedAction({
    workflowState,
    workflowContext,
    workflowPolicy,
    audit,
    pluginContext,
  });
}

export async function executeApprovedAction({
  workflowState,
  sessionID,
  approvalRequest,
  resolution = null,
  pluginContext = null,
  audit = null,
} = {}) {
  if (!workflowState || !sessionID || !approvalRequest) {
    return { outcome: "skip", reason: "missing-context" };
  }

  const state = workflowState.get(sessionID) ?? {};
  const repositorySnapshot = buildRepositorySnapshot(state);
  // Story 3.4: derive finalizationMode from the request metadata first (it
  // was set by buildApprovalRequest from the workflow policy at planning
  // time) and fall back to a fresh policy resolve so executor audit always
  // carries the correct mode even if the request was reconstructed by a
  // re-entry path.
  const requestFinalizationMode =
    typeof approvalRequest?.metadata?.finalization === "string" &&
    approvalRequest.metadata.finalization.length > 0
      ? approvalRequest.metadata.finalization
      : null;
  const baseWorkflowContext = buildWorkflowContext(sessionID, approvalRequest, {
    finalizationMode: requestFinalizationMode,
  });
  const liveFinalizationMode =
    requestFinalizationMode ??
    resolveWorkflowPolicy(pluginContext, baseWorkflowContext)?.finalization ??
    null;
  const workflowContext = {
    ...baseWorkflowContext,
    finalizationMode: liveFinalizationMode,
  };
  const approvedAt = resolution?.resolvedAt ?? new Date().toISOString();

  let envelope;
  if (approvalRequest.actionType === "init" && approvalRequest.proposal?.kind === "init") {
    // strengthen-git-init-proposal Task 8 / TD #12 / TD #13.
    // On success: clear initProposal slot, refresh readiness (best-effort),
    // build a baseline commit proposal, publish it.
    // On failure (envelope.ok === false): leave initProposal in place so the
    // recovery gate's "Retry" choice can re-publish it.
    const plan = buildInitAction({
      directory: pluginContext?.directory ?? "",
      correlationId: approvalRequest.proposal.correlationId ?? null,
      gitignoreContent: null,
    });

    // F6 fix: executeInit can throw (executor bugs, unexpected runner shapes,
    // bootstrap drift). Without a catch, the throw bubbles to permission-asked
    // outer try/catch which silently swallows it — the user sees no error and
    // initProposal slot has no recovery path. Convert the throw into a
    // synthetic failure envelope so the recovery gate opens normally.
    try {
      envelope = await executeInit({
        plan,
        approval: { resolvedAt: approvedAt },
        expectedState: repositorySnapshot,
        repositorySnapshot,
        workflowContext,
        gitRunner: pluginContext?.gitActionRunner ?? null,
        audit,
        workflowState,
      });
    } catch (initError) {
      envelope = {
        ok: false,
        status: "failed",
        action: {
          kind: "init",
          operation: "init",
          branchName: null,
          targetBranch: null,
          remoteName: null,
          correlationId: plan.correlationId ?? null,
          approvedAt,
        },
        code: "executor-threw",
        message: initError?.message ?? String(initError),
        details: { reason: "executeInit-threw" },
        audit: { attempted: false, logged: false, loggingError: null },
        next: { continueWorkflow: false, requiresRecoveryChoice: true },
      };
      if (audit) {
        try {
          await audit.info("git.action.executed", {
            event: "git.action.executed",
            timestamp: new Date().toISOString(),
            workflow: workflowContext.commandName,
            command: workflowContext.commandName,
            sessionID,
            outcome: "skip",
            details: {
              reason: "executor-threw",
              actionKind: "init",
              correlationId: plan.correlationId ?? null,
              error: initError?.message ?? String(initError),
            },
          });
        } catch {
          // best-effort
        }
      }
    }

    if (envelope?.ok) {
      let refreshedReadiness = null;
      try {
        refreshedReadiness = checkRepositoryReadiness({
          directory: pluginContext?.directory,
          gitRunner: pluginContext?.gitRunner,
          policy: null,
        });
      } catch (error) {
        refreshedReadiness = {
          outcome: "allow",
          reason: "post-init-fallback",
          message: "Assumed ready after successful git init.",
          details: {
            directory: pluginContext?.directory ?? "",
            isGitRepository: true,
            branch: null,
            hasRemote: false,
            remoteNames: [],
            checkedAt: new Date().toISOString(),
          },
        };
        if (audit) {
          try {
            await audit.info("git.readiness.refresh.failed", {
              event: "git.readiness.refresh.failed",
              timestamp: new Date().toISOString(),
              workflow: workflowContext.commandName,
              command: workflowContext.commandName,
              sessionID,
              outcome: "skip",
              details: {
                reason: "readiness-refresh-threw",
                error: error?.message ?? String(error),
              },
            });
          } catch {
            // best-effort
          }
        }
      }

      let files = [];
      try {
        const listed = pluginContext?.listChangedFiles?.();
        files = Array.isArray(listed) ? listed : [];
      } catch {
        files = [];
      }

      const baseline = buildBaselineCommitProposal({
        directory: pluginContext?.directory ?? "",
        files,
        sessionID,
      });

      const stateAfterInit = workflowState.get(sessionID) ?? {};
      workflowState.set(sessionID, {
        ...stateAfterInit,
        readiness: refreshedReadiness,
        initProposal: null,
        commitProposal: baseline,
      });

      if (audit) {
        try {
          await audit.info("git.action.planned", {
            event: "git.action.planned",
            timestamp: new Date().toISOString(),
            workflow: workflowContext.commandName,
            command: workflowContext.commandName,
            sessionID,
            outcome: "allow",
            details: {
              kind: "commit",
              action: "baseline-commit",
              requiresApproval: true,
              correlationId: baseline.correlationId,
              phase: workflowContext.phase ?? null,
            },
          });
        } catch {
          // best-effort
        }
      }

      // F4 fix: refresh phase on the workflow context before publishing the
      // baseline commit. The init approvalRequest carried `phase: "start"`,
      // but downstream policy gating (commit/push finalization) reads phase
      // off the context that lands inside the next approvalRequest.
      const postInitWorkflowContext = {
        ...workflowContext,
        phase: "in-progress",
      };
      const postInitPolicy = resolveWorkflowPolicy(pluginContext, postInitWorkflowContext);
      await publishNextPlannedAction({
        workflowState,
        workflowContext: postInitWorkflowContext,
        workflowPolicy: postInitPolicy,
        audit,
        pluginContext,
      });
    }

    return { outcome: "executed", envelope };
  } else if (approvalRequest.actionType === "commit" && approvalRequest.proposal?.kind === "commit") {
    const isBaselineCommit = approvalRequest.proposal?.action === "baseline-commit";

    // strengthen-approval-prompt-instructions follow-up: when the user picks
    // "Setup .gitignore and Commit" on either baseline variant (sensitive or
    // not), write the DEFAULT_GITIGNORE_LINES template AND append any
    // sensitive rules carried by the proposal, then refresh the file list
    // via `pluginContext.listChangedFiles()` so the resulting commit
    // reflects the cleaned working tree. "Commit Without .gitignore" (and
    // the legacy "Add to .gitignore and Commit" / "Commit Anyway" labels)
    // fall through with their proposal.files unchanged.
    let baselineFiles = approvalRequest.proposal.files ?? [];
    let baselineAllowEmpty = approvalRequest.proposal?.allowEmpty === true;
    if (isBaselineCommit) {
      const normalizedAnswer = normalizeUserAnswer(approvalRequest.userAnswer);
      const sensitiveRules = Array.isArray(approvalRequest.proposal?.sensitiveRules)
        ? approvalRequest.proposal.sensitiveRules
        : [];
      const setupGitignore =
        normalizedAnswer === "setup gitignore and commit" ||
        // legacy label retained for backward compat with the previous build
        (normalizedAnswer === "add to gitignore and commit" && sensitiveRules.length > 0);
      if (setupGitignore) {
        // The default template covers common no-go paths (.env, *.pem,
        // node_modules/, _bmad-output/, etc.). Sensitive rules add any
        // extras the scan flagged for this specific working tree.
        const rulesToAppend = Array.from(
          new Set([...DEFAULT_GITIGNORE_LINES, ...sensitiveRules]),
        );
        const appended = await appendGitignoreRules(
          approvalRequest.proposal.directory ?? pluginContext?.directory ?? "",
          rulesToAppend,
          audit,
        );
        if (appended && typeof pluginContext?.listChangedFiles === "function") {
          let refreshed = null;
          try {
            refreshed = pluginContext.listChangedFiles();
          } catch (error) {
            if (audit) {
              try {
                await audit.info("baseline-commit.gitignore.refresh.failed", {
                  event: "baseline-commit.gitignore.refresh.failed",
                  timestamp: new Date().toISOString(),
                  workflow: workflowContext.commandName,
                  command: workflowContext.commandName,
                  sessionID,
                  outcome: "skip",
                  details: { reason: "listChangedFiles-threw", error: error?.message ?? String(error) },
                });
              } catch {
                // best-effort
              }
            }
            refreshed = null;
          }
          if (Array.isArray(refreshed)) {
            baselineFiles = refreshed;
            baselineAllowEmpty = refreshed.length === 0;
            if (audit) {
              try {
                await audit.info("baseline-commit.gitignore.updated", {
                  event: "baseline-commit.gitignore.updated",
                  timestamp: new Date().toISOString(),
                  workflow: workflowContext.commandName,
                  command: workflowContext.commandName,
                  sessionID,
                  outcome: "allow",
                  details: {
                    rulesAppended: rulesToAppend,
                    filesRemaining: refreshed.length,
                  },
                });
              } catch {
                // best-effort
              }
            }
          }
        }
      }
    }

    const plan = buildCommitAction({
      message: approvalRequest.proposal.message,
      branchName: repositorySnapshot?.headBranch ?? null,
      correlationId: approvalRequest.proposal.correlationId ?? null,
      files: baselineFiles,
      // Baseline commit on a freshly initialized repo may have no working tree
      // changes. Propagate the flag so the executor uses `commit --allow-empty`.
      allowEmpty: baselineAllowEmpty,
    });

    envelope = await executeCommit({
      plan,
      approval: { resolvedAt: approvedAt },
      expectedState: repositorySnapshot,
      repositorySnapshot,
      workflowContext,
      gitRunner: pluginContext?.gitActionRunner ?? null,
      audit,
      workflowState,
    });

    if (envelope.ok) {
      // Executor envelope places observed post-action state under details
      // (see git-executor.js); reach for it there instead of envelope root.
      await publishPushApprovalIfNeeded({
        workflowState,
        sessionID,
        approvalRequest,
        pluginContext,
        audit,
        repositorySnapshot,
        observedState: envelope.details?.observedState ?? null,
      });

      // strengthen-git-init-proposal Task 8 / TD #11: post-baseline-commit
      // chain. After the first commit lands, evaluate branch strategy so the
      // workflow can move to the `feature/...` branch instead of `main`.
      // push and branch live in separate slots — when no remote exists the
      // push call above already noop'd, and branch publish picks up here.
      if (isBaselineCommit) {
        const branchConfig = pluginContext?.runtimeConfig?.config?.branch ?? null;
        const postCommitPolicy = resolveWorkflowPolicy(pluginContext, workflowContext);
        // F2 fix: read the actual HEAD branch from the refreshed readiness so
        // evaluateBranchStrategy can distinguish "already on right branch"
        // from "needs switch". Without this, currentBranch=null forces the
        // strategy into create/switch every time even when the auto-created
        // init branch already matches the long-lived branch set.
        const postBaselineState = workflowState.get(sessionID);
        const postBaselineCurrentBranch =
          typeof postBaselineState?.readiness?.details?.branch === "string" &&
          postBaselineState.readiness.details.branch.length > 0
            ? postBaselineState.readiness.details.branch
            : null;
        await planBranchProposal({
          workflowContext,
          workflowPolicy: postCommitPolicy,
          branchConfig,
          currentBranch: postBaselineCurrentBranch,
          workflowState,
          audit,
        });
        await publishNextPlannedAction({
          workflowState,
          workflowContext,
          workflowPolicy: postCommitPolicy,
          audit,
          pluginContext,
        });
      }
    }
  } else if (
    approvalRequest.actionType === "push" &&
    approvalRequest.proposal?.kind === "push"
  ) {
    const branchName =
      approvalRequest.proposal.branchName ??
      approvalRequest.proposal.branch ??
      repositorySnapshot?.headBranch ??
      null;
    const targetBranch =
      approvalRequest.proposal.targetBranch ?? branchName ?? null;
    // Trust the proposal's remoteName: it was validated by buildPushAction
    // when the push proposal was first published. A silent "origin" default
    // here would mask an upstream regression that lets a null through.
    const remoteName =
      approvalRequest.proposal.remoteName ??
      approvalRequest.proposal.remote ??
      null;

    const plan = buildPushAction({
      branchName,
      targetBranch,
      remoteName,
      correlationId: approvalRequest.proposal.correlationId ?? null,
    });

    envelope = await executePush({
      plan,
      approval: { resolvedAt: approvedAt },
      expectedState: repositorySnapshot,
      repositorySnapshot,
      workflowContext,
      gitRunner: pluginContext?.gitActionRunner ?? null,
      audit,
      workflowState,
    });

    if (envelope.ok) {
      const nextState = workflowState.get(sessionID) ?? {};
      workflowState.set(sessionID, {
        ...nextState,
        pushProposal: null,
      });
    }
  } else {
    // Surface the silent skip so a newly-added actionType is observable in
    // audit instead of disappearing through this branch unnoticed.
    if (audit) {
      try {
        // Story 3.4 (review M2): keep the unsupported-actionType skip event
        // on the same correlation axes as the runtime skip events emitted
        // from build-approval-resolution.js so an auditor sees a uniform
        // git.action.skipped shape across all skip causes.
        await audit.info("git.action.skipped", {
          event: "git.action.skipped",
          timestamp: new Date().toISOString(),
          workflow: workflowContext.commandName,
          command: workflowContext.commandName,
          sessionID,
          outcome: "skip",
          details: {
            reason: "unsupported-action-type",
            actionKind: approvalRequest?.proposal?.kind ?? null,
            actionType: approvalRequest?.actionType ?? null,
            actionId: approvalRequest?.actionId ?? null,
            correlationId: approvalRequest?.proposal?.correlationId ?? null,
            phase: workflowContext.phase ?? null,
            finalizationMode: workflowContext.finalizationMode ?? null,
            proposalKind: approvalRequest?.proposal?.kind ?? null,
          },
        });
      } catch {
        // Audit failure is itself best-effort.
      }
    }
    return { outcome: "skip", reason: "unsupported-action-type" };
  }

  return {
    outcome: "executed",
    envelope,
  };
}
