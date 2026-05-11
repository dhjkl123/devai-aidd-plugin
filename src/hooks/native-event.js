/**
 * native-event.js
 *
 * Single `event` handler for the opencode native plugin runtime. Routes
 * `event.type` through dedicated branches so a `.opencode/plugins` deployment
 * does not depend on the legacy named handlers (`command.execute.before`,
 * `permission.asked`, `file.edited`).
 *
 * Supported event types:
 *   - command.executed   → workflow detection, readiness/branch/init planning,
 *                          approval publish. Delegates to the existing
 *                          `command-execute-before` factory by adapting the
 *                          native payload into `{ command, arguments,
 *                          sessionID }` and a synthetic `{ parts: [] }`.
 *   - question.asked     → records pending native question records on session
 *                          state so a subsequent `question.replied` /
 *                          `question.rejected` can be matched.
 *   - question.replied   → resolves approval or recovery through the shared
 *                          resolver in `permission-asked.js`.
 *   - question.rejected  → treats as a controlled approval deny (sourceHook:
 *                          "question.rejected") or as a no-op for recovery
 *                          when no matching pending record is found.
 *   - session.idle       → best-effort finalization fallback when no active
 *                          approval / recovery gate is pending. Populates
 *                          touchedFiles via `pluginContext.listChangedFiles()`
 *                          if no `file.edited` events were observed.
 *   - session.deleted    → clears all workflow/approval/recovery/touched-file
 *                          state for the session.
 *
 * Determinism guarantee: the handler returns `undefined` on unknown/malformed
 * events and never throws. A throw here would be misread by the runtime as a
 * plugin failure and break unrelated handlers.
 */

import { resolveApprovalOrRecovery } from "./permission-asked.js";
import { readRecoveryGate } from "../services/approval/recovery-orchestrator.js";
import { evaluateWorkflowFinalization } from "../services/workflow/evaluate-workflow-finalization.js";
import { publishNextPlannedAction } from "../services/approval/publish-next-planned-action.js";
import { normalizeTrackedFileEntry } from "../services/workflow/finalization-artifacts.js";
import { APPROVAL_OUTCOMES } from "../services/approval/approval-resolution-state.js";
import {
  APPROVAL_OUTCOME_ALIASES,
  RECOVERY_CHOICE_ALIASES,
} from "../services/approval/permission-asked-aliases.js";
import { isTerminalRecoveryState } from "../services/approval/recovery-state.js";

function readSessionID(props) {
  const candidates = [
    props?.sessionID,
    props?.sessionId,
    props?.session_id,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function readCommandName(props) {
  const candidates = [props?.name, props?.command, props?.commandName];
  for (const value of candidates) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function readCommandArguments(props) {
  const candidates = [props?.arguments, props?.args, props?.argv];
  for (const value of candidates) {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.join(" ");
  }
  return "";
}

function readQuestionID(props) {
  const candidates = [
    props?.id,
    props?.questionID,
    props?.questionId,
    props?.question_id,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  // questions array fallback
  const questions = Array.isArray(props?.questions) ? props.questions : null;
  if (questions && questions.length > 0) {
    const first = questions[0];
    const inner = first?.id ?? first?.questionID ?? first?.questionId;
    if (typeof inner === "string" && inner.length > 0) return inner;
  }
  return null;
}

function readQuestionHeader(props) {
  const candidates = [
    props?.header,
    props?.title,
    props?.questionHeader,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  const questions = Array.isArray(props?.questions) ? props.questions : null;
  if (questions && questions.length > 0) {
    const first = questions[0];
    const inner = first?.header ?? first?.title ?? first?.text;
    if (typeof inner === "string" && inner.length > 0) return inner;
  }
  return null;
}

function readReplyRequestID(props) {
  const candidates = [
    props?.requestID,
    props?.requestId,
    props?.questionID,
    props?.questionId,
    props?.id,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function readReplyAnswer(props) {
  const answers = props?.answers;
  if (Array.isArray(answers) && answers.length > 0) {
    const first = answers[0];
    if (Array.isArray(first) && first.length > 0) {
      const inner = first[0];
      if (typeof inner === "string" && inner.length > 0) return inner;
    } else if (typeof first === "string" && first.length > 0) {
      return first;
    }
  }
  // Single-string fallback
  const single = props?.answer;
  if (typeof single === "string" && single.length > 0) return single;
  return null;
}

const APPROVAL_ANSWER_TOKENS = new Set([
  "initialize",
  "initialize git",
  "yes",
  "approve",
  "approved",
  "allow",
  "accept",
  "proceed",
  "continue",
  "ok",
]);

const DENY_ANSWER_TOKENS = new Set([
  "cancel",
  "no",
  "deny",
  "reject",
  "block",
  "stop",
]);

const IGNORE_ANSWER_TOKENS = new Set([
  "ignore",
  "ignore-and-continue",
  "skip",
]);

function normalizeAnswerKey(answer) {
  if (typeof answer !== "string") return "";
  return answer
    .toLowerCase()
    .replace(/\s*\(.*\)\s*$/, "")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/[^a-z0-9-]+/g, " ")
    .trim();
}

/**
 * Maps a question answer string to a canonical approval outcome.
 * Recognises labels emitted by the native question prompt (e.g.
 * "Initialize Git (Recommended)", "Cancel", "yes", "no").
 *
 * F3/F10 (adversarial review): exact-match only. Prefix matching was removed
 * because token prefixes overlap across approval and recovery vocabularies
 * (e.g. "continue" is both an approval-ish and a recovery alias) and would
 * silently coerce typos like "manualy" to recovery choices.
 */
function parseApprovalAnswerOutcome(answer) {
  const key = normalizeAnswerKey(answer);
  if (key.length === 0) return null;
  if (APPROVAL_OUTCOME_ALIASES[key]) return APPROVAL_OUTCOME_ALIASES[key];
  if (APPROVAL_ANSWER_TOKENS.has(key)) return APPROVAL_OUTCOMES.ACCEPT;
  if (DENY_ANSWER_TOKENS.has(key)) return APPROVAL_OUTCOMES.DENY;
  if (IGNORE_ANSWER_TOKENS.has(key)) return APPROVAL_OUTCOMES.IGNORE_AND_CONTINUE;
  // Hyphenated label fallback: "initialize-git" → "initialize git"
  const spaceKey = key.replace(/-/g, " ");
  if (APPROVAL_ANSWER_TOKENS.has(spaceKey)) return APPROVAL_OUTCOMES.ACCEPT;
  return null;
}

function parseRecoveryAnswerChoice(answer) {
  const key = normalizeAnswerKey(answer);
  if (key.length === 0) return null;
  if (RECOVERY_CHOICE_ALIASES[key]) return RECOVERY_CHOICE_ALIASES[key];
  return null;
}

function safeWorkflowStateUpdate(workflowState, sessionID, patch) {
  if (!workflowState || typeof sessionID !== "string" || sessionID.length === 0) {
    return;
  }
  try {
    const prior = workflowState.get(sessionID);
    if (!prior) return;
    workflowState.set(sessionID, { ...prior, ...patch });
  } catch {
    // best-effort
  }
}

function recordTouchedFilesFromList(workflowState, sessionID, paths, repositoryRoot) {
  if (!Array.isArray(paths) || paths.length === 0) return;
  const state = workflowState.get(sessionID);
  if (!state) return;
  const existing = Array.isArray(state.touchedFiles) ? state.touchedFiles : [];
  const seen = new Set(existing.map((e) => e?.path).filter(Boolean));
  const additions = [];
  for (const filePath of paths) {
    const normalized = normalizeTrackedFileEntry(filePath, repositoryRoot);
    if (!normalized) continue;
    if (seen.has(normalized.path)) continue;
    seen.add(normalized.path);
    additions.push(normalized);
  }
  if (additions.length === 0) return;
  workflowState.set(sessionID, {
    ...state,
    touchedFiles: [...existing, ...additions],
  });
}

async function handleCommandExecuted({ event, deps }) {
  const props = event?.properties ?? {};
  const sessionID = readSessionID(props);
  const commandName = readCommandName(props);
  if (!sessionID || !commandName) return;

  const adaptedInput = {
    command: commandName,
    arguments: readCommandArguments(props),
    sessionID,
  };
  const adaptedOutput = { parts: [] };

  try {
    await deps.commandExecuteBeforeHandler(adaptedInput, adaptedOutput);
  } catch (error) {
    // F9 (adversarial review): the legacy command handler emits its own
    // audits internally, but a synchronous factory throw is invisible
    // without this fallback. Surface it as native.event.handler.failed so
    // bootstrap failures don't disappear under native operation.
    if (deps.audit) {
      try {
        await deps.audit.info("native.event.handler.failed", {
          event: "native.event.handler.failed",
          timestamp: new Date().toISOString(),
          workflow: commandName,
          command: commandName,
          sessionID,
          outcome: "skip",
          details: {
            reason: "command-executed-delegation-threw",
            error: error?.message ?? String(error),
          },
        });
      } catch {
        // best-effort
      }
    }
  }

  // F5/F6: command.executed signals a fresh workflow start (or re-entry).
  // Clear the native finalization marker so a subsequent session.idle for
  // this run can publish finalization. Without this, a session that was
  // already finalized in a previous run would refuse to publish again on
  // re-entry.
  safeWorkflowStateUpdate(deps.workflowState, sessionID, {
    nativeFinalizationPublishedAt: null,
  });

  // After detection-driven planning, if the session is now tracked AND has no
  // active approval, attempt finalization-style publish in case the workflow
  // command itself produced a finalizable state. This mirrors the previous
  // command.execute.before → tool.execute.after(finish) chain when running
  // under native event mode where `tool.execute.after` may not be invoked.
  try {
    const state = deps.workflowState?.get?.(sessionID);
    if (!state?.commandName) return;
    if (state.approvalCurrent) return;
    // Only run finalization fallback when caller explicitly signalled that
    // command.executed marks finalization (rare; most native flows still rely
    // on session.idle for finalization). We do NOT auto-finalize here to
    // avoid duplicate publishes during normal workflow start.
  } catch {
    // best-effort
  }
}

function recordPendingApprovalQuestion({ workflowState, sessionID, questionID, questionHeader, active }) {
  if (!questionID) return;
  safeWorkflowStateUpdate(workflowState, sessionID, {
    pendingApprovalQuestion: {
      questionID,
      approvalId: active.id,
      actionId: active.actionId ?? null,
      actionType: active.actionType ?? null,
      questionHeader: questionHeader ?? null,
      capturedAt: new Date().toISOString(),
    },
  });
}

function recordPendingRecoveryQuestion({ workflowState, sessionID, questionID, questionHeader, gate }) {
  if (!questionID) return;
  safeWorkflowStateUpdate(workflowState, sessionID, {
    pendingRecoveryQuestion: {
      questionID,
      recoveryGateId: gate.gateId ?? null,
      questionHeader: questionHeader ?? null,
      capturedAt: new Date().toISOString(),
    },
  });
}

function clearPendingApprovalQuestion(workflowState, sessionID) {
  safeWorkflowStateUpdate(workflowState, sessionID, { pendingApprovalQuestion: null });
}

function clearPendingRecoveryQuestion(workflowState, sessionID) {
  safeWorkflowStateUpdate(workflowState, sessionID, { pendingRecoveryQuestion: null });
}

async function handleQuestionAsked({ event, deps }) {
  const props = event?.properties ?? {};
  const sessionID = readSessionID(props);
  const questionID = readQuestionID(props);
  const questionHeader = readQuestionHeader(props);
  if (!sessionID || !questionID) return;

  const state = deps.workflowState?.get?.(sessionID);
  if (!state) return;

  // F4 (adversarial review): when a non-terminal recovery gate exists, always
  // route the question to recovery — regardless of whether the question header
  // matches `Recovery required:`. Models routinely paraphrase headers, and
  // header-only matching makes recovery routing brittle. A non-terminal gate
  // is unambiguous: the only question we could be asking is the recovery
  // continuation, since approval/recovery are sequenced (resolver opens gate
  // only AFTER approval resolves and clears approvalCurrent).
  const gate = readRecoveryGate(deps.workflowState, sessionID);
  if (gate && !isTerminalRecoveryState(gate.state)) {
    recordPendingRecoveryQuestion({
      workflowState: deps.workflowState,
      sessionID,
      questionID,
      questionHeader,
      gate,
    });
    return;
  }

  const active = state.approvalCurrent ?? null;
  if (active) {
    recordPendingApprovalQuestion({
      workflowState: deps.workflowState,
      sessionID,
      questionID,
      questionHeader,
      active,
    });
  }
  // F1 (adversarial review): the previous header-based fallback was dead code.
  // Workflow detection (command.executed → command-execute-before) always
  // persists workflow state and approvalCurrent BEFORE the prompt is sent, so
  // a question that arrives without either an active approval or an active
  // recovery gate is genuinely unrelated to this plugin. We intentionally
  // return without recording — non-workflow questions must not be tracked.
}

async function handleQuestionReplied({ event, deps }) {
  const props = event?.properties ?? {};
  const sessionID = readSessionID(props);
  const requestID = readReplyRequestID(props);
  const answer = readReplyAnswer(props);
  if (!sessionID || !requestID) return;

  const state = deps.workflowState?.get?.(sessionID);
  if (!state) return;

  const pendingApproval = state.pendingApprovalQuestion ?? null;
  const pendingRecovery = state.pendingRecoveryQuestion ?? null;

  const matchesApproval =
    pendingApproval && pendingApproval.questionID === requestID;
  const matchesRecovery =
    pendingRecovery && pendingRecovery.questionID === requestID;

  if (!matchesApproval && !matchesRecovery) return;

  if (matchesRecovery) {
    const choice = parseRecoveryAnswerChoice(answer);
    clearPendingRecoveryQuestion(deps.workflowState, sessionID);
    await resolveApprovalOrRecovery({
      workflowState: deps.workflowState,
      audit: deps.audit,
      pluginContext: deps.pluginContext,
      sessionID,
      sourceHook: "question.replied",
      parsedOutcome: null,
      parsedRecoveryChoice: choice,
      echoedRequestId: null,
      echoedActionId: null,
      echoedRecoveryGateId: pendingRecovery.recoveryGateId ?? null,
      verifyManual: false,
    });
    return;
  }

  const outcome = parseApprovalAnswerOutcome(answer);
  clearPendingApprovalQuestion(deps.workflowState, sessionID);
  await resolveApprovalOrRecovery({
    workflowState: deps.workflowState,
    audit: deps.audit,
    pluginContext: deps.pluginContext,
    sessionID,
    sourceHook: "question.replied",
    parsedOutcome: outcome,
    parsedRecoveryChoice: null,
    echoedRequestId: pendingApproval.approvalId ?? null,
    echoedActionId: pendingApproval.actionId ?? null,
    echoedRecoveryGateId: null,
    verifyManual: false,
  });
}

async function handleQuestionRejected({ event, deps }) {
  const props = event?.properties ?? {};
  const sessionID = readSessionID(props);
  const requestID = readReplyRequestID(props);
  if (!sessionID || !requestID) return;

  const state = deps.workflowState?.get?.(sessionID);
  if (!state) return;

  const pendingApproval = state.pendingApprovalQuestion ?? null;
  const pendingRecovery = state.pendingRecoveryQuestion ?? null;

  if (pendingRecovery && pendingRecovery.questionID === requestID) {
    clearPendingRecoveryQuestion(deps.workflowState, sessionID);
    // Recovery rejection: leave the gate observable but clear the pending
    // question record. Do NOT silently abandon — the user can re-ask.
    return;
  }

  if (pendingApproval && pendingApproval.questionID === requestID) {
    clearPendingApprovalQuestion(deps.workflowState, sessionID);
    await resolveApprovalOrRecovery({
      workflowState: deps.workflowState,
      audit: deps.audit,
      pluginContext: deps.pluginContext,
      sessionID,
      sourceHook: "question.rejected",
      parsedOutcome: APPROVAL_OUTCOMES.DENY,
      parsedRecoveryChoice: null,
      echoedRequestId: pendingApproval.approvalId ?? null,
      echoedActionId: pendingApproval.actionId ?? null,
      echoedRecoveryGateId: null,
      verifyManual: false,
    });
  }
}

async function handleSessionDeleted({ event, deps }) {
  const props = event?.properties ?? {};
  const sessionID = readSessionID(props);
  if (!sessionID) return;
  try {
    deps.workflowState?.clear?.(sessionID);
  } catch {
    // best-effort
  }
}

async function handleSessionIdle({ event, deps }) {
  const props = event?.properties ?? {};
  const sessionID = readSessionID(props);
  if (!sessionID) return;

  const state = deps.workflowState?.get?.(sessionID);
  if (!state?.commandName) return;
  if (state.approvalCurrent) return;
  const gate = readRecoveryGate(deps.workflowState, sessionID);
  if (gate && !isTerminalRecoveryState(gate.state)) return;

  // F5/F6 (adversarial review): idempotency marker. If finalization has
  // already been evaluated for this session — either via legacy
  // `tool.execute.after("finish")` or a prior `session.idle` — skip republish
  // so we don't double-publish commit/push approvals across the legacy and
  // native ingress paths.
  if (state.nativeFinalizationPublishedAt) return;

  // Populate touchedFiles from a git status fallback. We refresh on every
  // session.idle so partial coverage (file.edited fired for 1 file but git
  // status shows 10) cannot drop the remaining changes — see F8.
  if (typeof deps.pluginContext?.listChangedFiles === "function") {
    try {
      const changed = deps.pluginContext.listChangedFiles();
      recordTouchedFilesFromList(
        deps.workflowState,
        sessionID,
        changed,
        deps.pluginContext?.directory,
      );
    } catch {
      // best-effort
    }
  }

  // Run finalization assessment + commit/push approval publish, mirroring
  // the legacy tool.execute.after(finish) finalization path.
  try {
    const assessment = await evaluateWorkflowFinalization({
      workflowState: deps.workflowState,
      sessionID,
      input: { sessionID, tool: "finish" },
      output: { changedFiles: [] },
      audit: deps.audit,
      pluginContext: deps.pluginContext,
    });

    const finishedState = deps.workflowState?.get?.(sessionID) ?? null;
    const hasFinalizationProposal =
      finishedState?.commitProposal != null || finishedState?.pushProposal != null;
    const shouldPublishFinishApproval =
      Boolean(finishedState?.commandName) &&
      (assessment?.outcome === "allow" || hasFinalizationProposal);
    if (shouldPublishFinishApproval) {
      const workflowContext = {
        commandName: finishedState.commandName,
        arguments: finishedState.arguments || "",
        sessionID,
        detectedAt: finishedState.detectedAt,
        phase: finishedState.phase || "finish",
      };
      const resolvedPolicy = deps.pluginContext?.resolvePolicy?.(workflowContext);
      const workflowPolicy =
        resolvedPolicy?.outcome === "allow"
          ? resolvedPolicy.details?.policy || null
          : null;
      await publishNextPlannedAction({
        workflowState: deps.workflowState,
        workflowContext,
        workflowPolicy,
        audit: deps.audit,
        pluginContext: deps.pluginContext,
      });
    }

    // Stamp the marker AFTER the publish (or after assessment if no publish
    // was needed) so subsequent session.idle events on the same session see
    // it and short-circuit.
    safeWorkflowStateUpdate(deps.workflowState, sessionID, {
      nativeFinalizationPublishedAt: new Date().toISOString(),
    });
  } catch {
    // finalization is best-effort under session.idle
  }
}

/**
 * @param {{
 *   workflowState: object,
 *   audit: object | null,
 *   pluginContext: object | null,
 *   commandExecuteBeforeHandler: Function
 * }} injections
 */
export function createNativeEventHook(injections = {}) {
  const deps = {
    workflowState: injections.workflowState,
    audit: injections.audit ?? null,
    pluginContext: injections.pluginContext ?? null,
    commandExecuteBeforeHandler: injections.commandExecuteBeforeHandler,
  };

  return async function nativeEventHandler(payload) {
    const event = payload?.event ?? null;
    if (!event || typeof event !== "object") return;
    const type = typeof event.type === "string" ? event.type : null;
    if (!type) return;

    deps.pluginContext?.debug?.log?.("native-event", `received event.type=${type}`, {
      sessionID: readSessionID(event?.properties),
      props: event?.properties
        ? {
            name: event.properties.name ?? null,
            id: event.properties.id ?? null,
            requestID: event.properties.requestID ?? null,
          }
        : null,
    });

    try {
      switch (type) {
        case "command.executed":
          await handleCommandExecuted({ event, deps });
          return;
        case "question.asked":
          await handleQuestionAsked({ event, deps });
          return;
        case "question.replied":
          await handleQuestionReplied({ event, deps });
          return;
        case "question.rejected":
          await handleQuestionRejected({ event, deps });
          return;
        case "session.idle":
          await handleSessionIdle({ event, deps });
          return;
        case "session.deleted":
          await handleSessionDeleted({ event, deps });
          return;
        default:
          return;
      }
    } catch (error) {
      if (deps.audit) {
        try {
          await deps.audit.info("native.event.handler.failed", {
            event: "native.event.handler.failed",
            timestamp: new Date().toISOString(),
            workflow: null,
            command: null,
            sessionID: readSessionID(event?.properties) ?? null,
            outcome: "skip",
            details: {
              reason: "native-handler-threw",
              eventType: type,
              error: error?.message ?? String(error),
            },
          });
        } catch {
          // best-effort
        }
      }
    }
  };
}
