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

 *   - question.rejected  → treats as a controlled `ignore-and-continue` skip
 *                          (sourceHook: "question.rejected") since UI dismiss
 *                          (X button) is closer in intent to "ignore" than to
 *                          an explicit deny — the user never saw a Deny option
 *                          (those were removed from commit/push/branch prompts).
 *                          No-op for recovery when no matching pending record
 *                          is found.
 *   - session.deleted    → clears all workflow/approval/recovery/touched-file
 *                          state for the session.
 *
 * Determinism guarantee: the handler returns `undefined` on unknown/malformed
 * events and never throws. A throw here would be misread by the runtime as a
 * plugin failure and break unrelated handlers.
 */

import { deliverRecoveryPrompt, resolveApprovalOrRecovery } from "./permission-asked.js";
import {
  openRecoveryFromExecution,
  readRecoveryGate,
} from "../services/approval/recovery-orchestrator.js";
import { APPROVAL_OUTCOMES } from "../services/approval/approval-resolution-state.js";
import {
  APPROVAL_OUTCOME_ALIASES,
  RECOVERY_CHOICE_ALIASES,
} from "../services/approval/permission-asked-aliases.js";
import { isTerminalRecoveryState } from "../services/approval/recovery-state.js";
import { executeStartupChain } from "../services/git/startup-chain-executor.js";
import { buildStartupChainQuestionInstruction } from "../services/approval/build-startup-chain-question-instruction.js";

function summarizeEventProps(type, props) {
  if (!props || typeof props !== "object") return null;

  switch (type) {
    case "command.executed": {
      const args =
        typeof props.arguments === "string"
          ? props.arguments
          : Array.isArray(props.arguments)
          ? props.arguments.join(" ")
          : null;
      return {
        name: props.name ?? props.command ?? null,
        argsPreview: args ? args.slice(0, 120) : null,
      };
    }
    case "question.asked": {
      const questions = Array.isArray(props.questions) ? props.questions : [];
      const first = questions[0] || {};
      const optionsRaw = Array.isArray(first.options)
        ? first.options
        : Array.isArray(props.options)
        ? props.options
        : null;
      const options = Array.isArray(optionsRaw)
        ? optionsRaw
            .map((o) => (typeof o === "string" ? o : o?.label ?? null))
            .filter((v) => typeof v === "string")
        : null;
      return {
        questionID: props.id ?? first.id ?? null,
        header: props.header ?? props.title ?? first.header ?? first.title ?? null,
        options,
      };
    }
    case "question.replied":
    case "question.rejected": {
      let answer = null;
      const answers = props.answers;
      if (Array.isArray(answers) && answers.length > 0) {
        const a = answers[0];
        if (Array.isArray(a) && a.length > 0 && typeof a[0] === "string") answer = a[0];
        else if (typeof a === "string") answer = a;
      } else if (typeof props.answer === "string") {
        answer = props.answer;
      }
      return {
        requestID: props.requestID ?? props.requestId ?? props.id ?? null,
        answer,
      };
    }
    default:
      return null;
  }
}

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

function readQuestionRecords(props) {
  const questions = Array.isArray(props?.questions) ? props.questions : [];
  if (questions.length > 0) {
    return questions.map((question) => ({
      id: typeof question?.id === "string" ? question.id : null,
      header:
        typeof question?.header === "string"
          ? question.header
          : typeof question?.title === "string"
            ? question.title
            : null,
      options: Array.isArray(question?.options) ? question.options : [],
    }));
  }
  const id = readQuestionID(props);
  const header = readQuestionHeader(props);
  if (!id && !header) return [];
  return [{ id, header, options: props?.options ?? [] }];
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

export function readReplyAnswers(props, pendingStartupQuestion) {
  const ids = Array.isArray(pendingStartupQuestion?.questionIds)
    ? pendingStartupQuestion.questionIds
    : [];
  const keys = Array.isArray(pendingStartupQuestion?.questionKeys)
    ? pendingStartupQuestion.questionKeys
    : [];
  const idToKey = new Map(ids.map((id, index) => [id, keys[index]]));
  const answers = props?.answers;
  const mapped = {};

  if (Array.isArray(answers)) {
    for (let index = 0; index < answers.length; index += 1) {
      const entry = answers[index];
      if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        const id = entry.id ?? entry.questionID ?? entry.questionId;
        const answer = entry.answer ?? entry.value ?? entry.label;
        const key = typeof id === "string" ? idToKey.get(id) : null;
        if (key && typeof answer === "string") mapped[key] = answer;
        continue;
      }
      if (Array.isArray(entry)) {
        const answer = entry.find((value) => typeof value === "string");
        const key = keys[index];
        if (key && typeof answer === "string") mapped[key] = answer;
        continue;
      }
      if (typeof entry === "string") {
        const key = keys[index];
        if (key) mapped[key] = entry;
      }
    }
  } else if (answers && typeof answers === "object") {
    for (const [id, answer] of Object.entries(answers)) {
      const key = idToKey.get(id);
      if (key && typeof answer === "string") mapped[key] = answer;
    }
  } else if (typeof props?.answer === "string" && keys.length === 1) {
    mapped[keys[0]] = props.answer;
  }

  const complete = keys.length > 0 && keys.every((key) => typeof mapped[key] === "string");
  return complete ? mapped : null;
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

/**
 * Adapt a native command-or-skill invocation into the legacy
 * `command.execute.before` payload shape and invoke the shared handler.
 *
 * Exported so `tool-execute-before.js` can reuse the exact adapt code when
 * the model invokes a Skill via the `tool.execute.before` channel — keeping
 * a single source of truth for the synthetic `{ parts: [] }` output shape
 * and the error-surfacing audit fallback.
 *
 * `commandName` is the resolved workflow name (skill or command). `args` is
 * a string (already joined). `audit` is best-effort.
 */
export async function adaptAndInvokeCommandHandler({
  commandExecuteBeforeHandler,
  commandName,
  args,
  sessionID,
  audit,
  source,
}) {
  if (typeof commandExecuteBeforeHandler !== "function") return;
  if (typeof commandName !== "string" || commandName.length === 0) return;
  if (typeof sessionID !== "string" || sessionID.length === 0) return;

  const adaptedInput = {
    command: commandName,
    arguments: typeof args === "string" ? args : "",
    sessionID,
  };
  const adaptedOutput = { parts: [] };

  try {
    await commandExecuteBeforeHandler(adaptedInput, adaptedOutput);
  } catch (error) {
    if (audit) {
      try {
        await audit.info("native.event.handler.failed", {
          event: "native.event.handler.failed",
          timestamp: new Date().toISOString(),
          workflow: commandName,
          command: commandName,
          sessionID,
          outcome: "skip",
          details: {
            reason:
              source === "tool-execute-before"
                ? "skill-trigger-delegation-threw"
                : "command-executed-delegation-threw",
            error: error?.message ?? String(error),
          },
        });
      } catch {
        // best-effort
      }
    }
  }
}

async function handleCommandExecuted({ event, deps }) {
  const props = event?.properties ?? {};
  const sessionID = readSessionID(props);
  const commandName = readCommandName(props);
  if (!sessionID || !commandName) return;

  await adaptAndInvokeCommandHandler({
    commandExecuteBeforeHandler: deps.commandExecuteBeforeHandler,
    commandName,
    args: readCommandArguments(props),
    sessionID,
    audit: deps.audit,
    source: "command.executed",
  });
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

function recordPendingStartupQuestion({ workflowState, sessionID, records, chain }) {
  if (!Array.isArray(records) || records.length === 0 || !chain) return;
  const questionKeys = Array.isArray(chain.steps) ? chain.steps.map((step) => step.key) : [];
  const expectedIds = questionKeys.map((key) => `${chain.startupChainId}:${key}`);
  // Prefer ids echoed back by the runtime when present; otherwise synthesise
  // from the chain's expected id format so reply matching still works.
  const questionIds = records.map((record, index) =>
    typeof record.id === "string" && record.id.length > 0 ? record.id : expectedIds[index] ?? null,
  );
  safeWorkflowStateUpdate(workflowState, sessionID, {
    pendingStartupQuestion: {
      startupChainId: chain.startupChainId ?? null,
      questionIds,
      questionKeys,
      questionHeaders: records.map((record) => record.header ?? null),
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
  if (!sessionID) return;

  const state = deps.workflowState?.get?.(sessionID);
  if (!state) return;

  const startupChain = state.startupChainCurrent ?? null;
  if (startupChain) {
    const records = readQuestionRecords(props);
    const expectedIds = new Set(
      Array.isArray(startupChain.steps)
        ? startupChain.steps.map((step) => `${startupChain.startupChainId}:${step.key}`)
        : [],
    );
    let expectedHeaders = [];
    try {
      const expected = buildStartupChainQuestionInstruction(startupChain);
      expectedHeaders = (expected.questions ?? []).map((q) => q.header);
    } catch {
      // best-effort: fall back to empty so header matching simply fails
      // gracefully instead of crashing the hook.
      expectedHeaders = [];
    }
    const headerMatch =
      records.length === expectedHeaders.length &&
      expectedHeaders.every((header, index) => records[index]?.header === header);
    const hasStartupQuestion =
      props?.metadata?.startupChain === true ||
      records.some((record) => expectedIds.has(record.id)) ||
      headerMatch;
    if (hasStartupQuestion) {
      recordPendingStartupQuestion({
        workflowState: deps.workflowState,
        sessionID,
        records,
        chain: startupChain,
      });
      return;
    }
  }

  if (!questionID) return;

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
  if (!sessionID) return;

  const state = deps.workflowState?.get?.(sessionID);
  if (!state) return;

  const pendingStartup = state.pendingStartupQuestion ?? null;
  const startupChain = state.startupChainCurrent ?? null;
  const startupMatches =
    pendingStartup &&
    startupChain &&
    (!requestID ||
      pendingStartup.questionIds?.includes?.(requestID) ||
      requestID === pendingStartup.startupChainId);
  if (startupMatches) {
    const answers = readReplyAnswers(props, pendingStartup);
    if (!answers) {
      if (deps.audit) {
        try {
          await deps.audit.info("startup.chain.answer.unmatched", {
            event: "startup.chain.answer.unmatched",
            timestamp: new Date().toISOString(),
            workflow: startupChain.commandName ?? null,
            command: startupChain.commandName ?? null,
            sessionID,
            outcome: "skip",
            details: {
              startupChainId: startupChain.startupChainId ?? null,
              questionIds: pendingStartup.questionIds ?? [],
            },
          });
        } catch {
          // best-effort
        }
      }
      try {
        await deps.pluginContext?.requestStartupChainApproval?.(startupChain);
      } catch {
        // best-effort: chain remains pending
      }
      return;
    }

    safeWorkflowStateUpdate(deps.workflowState, sessionID, { pendingStartupQuestion: null });
    const executionResult = await executeStartupChain({
      workflowState: deps.workflowState,
      sessionID,
      chain: startupChain,
      answers,
      pluginContext: deps.pluginContext,
      audit: deps.audit,
    });
    if (executionResult?.outcome === "failed" && executionResult.envelope?.ok === false) {
      try {
        const recoveryResult = await openRecoveryFromExecution({
          workflowState: deps.workflowState,
          sessionID,
          envelope: executionResult.envelope,
          workflow: startupChain.commandName ?? null,
          command: startupChain.commandName ?? null,
          audit: deps.audit,
        });
        if (recoveryResult.outcome === "opened" && recoveryResult.gate) {
          await deliverRecoveryPrompt({
            pluginContext: deps.pluginContext,
            gate: recoveryResult.gate,
            audit: deps.audit,
            sessionID,
            workflow: startupChain.commandName ?? null,
            command: startupChain.commandName ?? null,
          });
        }
      } catch {
        // best-effort
      }
    }
    return;
  }

  if (!requestID) return;

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

  // strengthen-approval-prompt-instructions follow-up: preserve the raw
  // user-facing answer on `approvalCurrent` so the executor can disambiguate
  // multiple ACCEPT-style options that share the same outcome (e.g.
  // "Add to .gitignore and Commit" vs "Commit Anyway" both resolve to
  // "accept" but require different executor branches).
  if (state?.approvalCurrent && typeof answer === "string" && answer.length > 0) {
    safeWorkflowStateUpdate(deps.workflowState, sessionID, {
      approvalCurrent: {
        ...state.approvalCurrent,
        userAnswer: answer,
      },
    });
  }

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
      parsedOutcome: APPROVAL_OUTCOMES.IGNORE_AND_CONTINUE,
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
      props: summarizeEventProps(type, event?.properties),
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
