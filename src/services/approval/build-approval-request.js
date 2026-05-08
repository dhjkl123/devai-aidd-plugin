/**
 * build-approval-request.js
 *
 * Pure function: constructs an ApprovalRequest object from a single proposal,
 * workflow context, policy, and readiness. No I/O or side-effects.
 *
 * Story 2.1 contract (preserved):
 *   {
 *     id, sessionID, workflow, command, phase, actionType,
 *     status: "awaitingApproval", proposal, prompt, metadata, createdAt
 *   }
 *
 * Story 2.3 extensions:
 *   - actionId: deterministic per-action identifier shared across the
 *     approval-requested → approval-resolved → git.action.skipped chain.
 *
 * Story 2.2 extensions:
 *   - prompt: { title, summary, lines, actionType, workflow }
 *   - metadata.event = "approval.requested"
 *   - metadata.actionCategory, policyCategory, identityStrategy, finalization,
 *     proposalKind (existing), proposalAction, detailLevel, sensitivity,
 *     explanation: { intentSummary, impactSummary, workflowSummary,
 *                    policyRationale, fields }
 *
 * `prompt.summary` remains the single-line backwards-compatible field consumed
 * by the runtime adapter in src/index.js. `prompt.lines` carries the richer
 * Story 2.2 explanation in render order.
 *
 * The `id` is intentionally stable so the same inputs always produce the same
 * id, enabling idempotent re-entry without issuing a second prompt.
 */

import {
  buildApprovalExplanation,
  buildFallbackExplanation,
} from "./build-approval-explanation.js";

const APPROVAL_EVENT_NAME = "approval.requested";

/**
 * Builds a stable fingerprint string from proposal fields.
 * Uses only stable, scalar values — avoids timestamps or random elements.
 *
 * `current` is included so that two branch proposals with the same target
 * candidate name but different starting branches produce distinct ids.
 *
 * @param {{ kind: string, action?: string, name?: string, current?: string | null, directory?: string, [key: string]: unknown }} proposal
 * @returns {string}
 */
function buildProposalFingerprint(proposal) {
  const parts = [proposal.kind || "unknown"];
  if (proposal.action) {
    parts.push(proposal.action);
  }
  if (proposal.name) {
    parts.push(proposal.name);
  }
  if (proposal.current) {
    parts.push(`from:${proposal.current}`);
  }
  if (proposal.directory) {
    parts.push(proposal.directory);
  }
  return parts.join(":");
}

/**
 * Builds a deterministic approval request ID.
 * Format: `approval:{sessionID}:{actionType}:{fingerprint}`
 *
 * @param {string} sessionID
 * @param {string} actionType
 * @param {object} proposal
 * @returns {string}
 */
function buildRequestId(sessionID, actionType, proposal) {
  const fingerprint = buildProposalFingerprint(proposal);
  return `approval:${sessionID}:${actionType}:${fingerprint}`;
}

/**
 * Builds a deterministic actionId from the same proposal fingerprint.
 * Story 2.3 introduces a stable per-action identifier that is decoupled
 * from sessionID so that audit/state can correlate the same action across
 * approval-requested → approval-resolved → git.action.skipped events.
 *
 * Format: `action:{actionType}:{fingerprint}`
 *
 * @param {string} actionType
 * @param {object} proposal
 * @returns {string}
 */
export function buildActionId(actionType, proposal) {
  const fingerprint = buildProposalFingerprint(proposal);
  return `action:${actionType}:${fingerprint}`;
}

const PROMPT_TITLE = "Approval Required";

/**
 * Composes the prompt body from the canonical explanation payload.
 *
 * @param {{
 *   intentSummary: string,
 *   impactSummary: string,
 *   workflowSummary: string,
 *   policyRationale: string
 * }} explanation
 * @returns {{ title: string, summary: string, lines: string[] }}
 */
function buildPromptBody(explanation) {
  return {
    title: PROMPT_TITLE,
    summary: explanation.intentSummary,
    lines: [
      `Intent: ${explanation.intentSummary}`,
      `Impact: ${explanation.impactSummary}`,
      `Context: ${explanation.workflowSummary}`,
      `Why approval is needed: ${explanation.policyRationale}`,
    ],
  };
}

function safeBuildExplanation(params) {
  try {
    return buildApprovalExplanation(params);
  } catch {
    return buildFallbackExplanation(params?.actionCategory);
  }
}

/**
 * Builds an ApprovalRequest from a classified action descriptor and context.
 *
 * @param {{
 *   sessionID: string,
 *   workflow: string,
 *   command: string,
 *   phase: string,
 *   actionType: string,
 *   proposal: object,
 *   workflowContext?: object | null,
 *   workflowPolicy?: object | null,
 *   readiness?: object | null,
 *   createdAt?: string
 * }} params
 * @returns {{
 *   id: string,
 *   actionId: string,
 *   sessionID: string,
 *   workflow: string,
 *   command: string,
 *   phase: string,
 *   actionType: string,
 *   status: "awaitingApproval",
 *   proposal: object,
 *   prompt: object,
 *   metadata: object,
 *   createdAt: string
 * }}
 */
export function buildApprovalRequest({
  sessionID,
  workflow,
  command,
  phase,
  actionType,
  proposal,
  workflowContext = null,
  workflowPolicy = null,
  readiness = null,
  createdAt,
}) {
  const resolvedCreatedAt = createdAt || new Date().toISOString();
  const id = buildRequestId(sessionID, actionType, proposal);
  const actionId = buildActionId(actionType, proposal);

  // Story 2.2: derive a single canonical explanation payload, then render
  // body and metadata FROM IT — never recompute strings on the metadata path.
  const explanation = safeBuildExplanation({
    actionCategory: actionType,
    workflowContext,
    workflowPolicy,
    branchProposal: proposal?.kind === "branch" ? proposal : null,
    initProposal: proposal?.kind === "init" ? proposal : null,
    readiness,
    commitProposal: proposal?.kind === "commit" ? proposal : null,
    pushProposal: proposal?.kind === "push" ? proposal : null,
  });

  const prompt = buildPromptBody(explanation);

  const metadata = {
    event: APPROVAL_EVENT_NAME,
    actionCategory: actionType,
    workflow,
    command,
    proposalKind: proposal?.kind,
    proposalAction: proposal?.action || null,
    policyCategory: workflowPolicy?.category || null,
    identityStrategy: workflowPolicy?.identityStrategy || null,
    finalization: workflowPolicy?.finalization || null,
    detailLevel: explanation.detailLevel,
    sensitivity: explanation.sensitivity,
    explanation: {
      intentSummary: explanation.intentSummary,
      impactSummary: explanation.impactSummary,
      workflowSummary: explanation.workflowSummary,
      policyRationale: explanation.policyRationale,
      fallback: explanation.fallback === true,
      fields: explanation.fields,
    },
  };

  return {
    id,
    actionId,
    sessionID,
    workflow,
    command,
    phase,
    actionType,
    status: "awaitingApproval",
    proposal,
    prompt,
    metadata,
    createdAt: resolvedCreatedAt,
  };
}
