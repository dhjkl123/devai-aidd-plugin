/**
 * build-approval-explanation.js
 *
 * Pure function: given source-of-truth inputs (workflow context, policy, the
 * relevant proposal, readiness envelope), produces the canonical approval
 * explanation payload.
 *
 * Story 2.2 contract:
 *   - The payload here is the sole source for prompt body and metadata
 *     explanation. body/metadata renderers must NOT recompute strings.
 *   - All values are sanitized: no raw arguments, no full paths, no full URLs,
 *     no secrets. Branch names are already safe (produced by branch policy).
 *   - Free-form prose is forbidden; descriptions are rule-based composition.
 *
 * Output shape:
 *   {
 *     actionCategory,        // "branch/create" | "branch/switch" | "init" | "commit" | "push"
 *     intentSummary,         // short single-line: what the plugin will do
 *     impactSummary,         // short single-line: repo impact on accept
 *     workflowSummary,       // short single-line: workflow context
 *     policyRationale,       // short single-line: why approval is required now
 *     sensitivity: "sanitized",
 *     detailLevel: "concise",
 *     fields: { ... action-specific redacted-safe fields ... }
 *   }
 */

import {
  redactBranchLabel,
  redactDirectoryLabel,
  redactRemoteLabel,
} from "./redact-approval-fields.js";

const SENSITIVITY = "sanitized";
const DETAIL_LEVEL = "concise";

// ─────────────────────────────────────────────────────────────────────────────
// Identity strategy → short rationale clause.
// Used by policyRationale composition; never copied verbatim from user input.
// ─────────────────────────────────────────────────────────────────────────────
const IDENTITY_RATIONALE = {
  story: "현재 스토리 작업 문맥에 맞춘 변경을 분리하기 위해",
  "ticket-or-args": "현재 작업 식별자와 입력 문맥에 맞춘 변경을 구분하기 위해",
  "artifact-singleton": "단일 산출물 문맥을 유지하기 위해",
  "artifact-or-args": "산출물 또는 입력 문맥에 맞게 변경 범위를 한정하기 위해",
};

// ─────────────────────────────────────────────────────────────────────────────
// Finalization mode → short post-approval expectation clause.
// ─────────────────────────────────────────────────────────────────────────────
const FINALIZATION_RATIONALE = {
  "commit-and-push": "이후 커밋과 푸시 승인 요청이 이어질 수 있다.",
  "commit-optional-push": "커밋이 필요할 수 있고 푸시는 선택적일 수 있다.",
  "no-forced-finalization": "후속 Git 마무리 작업이 강제되지 않는다.",
};

// ─────────────────────────────────────────────────────────────────────────────
// readiness reason → short init rationale clause (init category only).
// When adding a new readiness reason in check-repository-readiness.js, register
// its user-facing rationale here too — otherwise the init policy rationale
// silently drops the readiness clause.
// ─────────────────────────────────────────────────────────────────────────────
const READINESS_RATIONALE = {
  "git-not-initialized":
    "현재 디렉터리가 아직 Git 저장소가 아니므로 후속 Git 자동화 전에 초기화가 필요하다.",
};

// ─────────────────────────────────────────────────────────────────────────────
// Branch reason code → short impact-clause helper.
// Reason codes come from branch-service / build-init-proposal — see Dev Notes.
// ─────────────────────────────────────────────────────────────────────────────
const BRANCH_REASON_CLAUSE = {
  "current-branch-is-long-lived": "현재 브랜치가 보호 대상이라 새 작업 브랜치를 분리한다",
  "current-branch-failed-validation":
    "현재 브랜치가 정책 패턴에 맞지 않아 새 작업 브랜치를 분리한다",
  "no-current-branch": "현재 작업 브랜치가 없어 새 작업 브랜치를 생성한다",
  "candidate-differs-from-current": "정책에 맞는 작업 브랜치로 전환한다",
};

const FALLBACK_EXPLANATION_FIELD = "(unavailable)";

function safeWorkflowName(workflowContext) {
  if (!workflowContext || typeof workflowContext !== "object") {
    return FALLBACK_EXPLANATION_FIELD;
  }
  const name =
    typeof workflowContext.normalizedCommand === "string" &&
    workflowContext.normalizedCommand.length > 0
      ? workflowContext.normalizedCommand
      : workflowContext.commandName;
  return typeof name === "string" && name.length > 0 ? name : FALLBACK_EXPLANATION_FIELD;
}

function policyCategory(workflowPolicy) {
  if (!workflowPolicy || typeof workflowPolicy !== "object") {
    return null;
  }
  return typeof workflowPolicy.category === "string" ? workflowPolicy.category : null;
}

function buildWorkflowSummary(workflowContext, workflowPolicy) {
  const workflow = safeWorkflowName(workflowContext);
  const category = policyCategory(workflowPolicy);
  if (category) {
    return `${workflow} 워크플로(${category} 정책)에서 요청되었다.`;
  }
  return `${workflow} 워크플로에서 요청되었다.`;
}

function buildPolicyRationale(workflowPolicy, extraClause) {
  const clauses = [];

  if (workflowPolicy && typeof workflowPolicy === "object") {
    const identityClause = IDENTITY_RATIONALE[workflowPolicy.identityStrategy];
    if (identityClause) {
      clauses.push(`${identityClause} 승인 단계가 필요하다.`);
    }

    if (workflowPolicy.branchRequired === true) {
      clauses.push("이 워크플로는 전용 브랜치 정책을 따른다.");
    }

    const finalizationClause = FINALIZATION_RATIONALE[workflowPolicy.finalization];
    if (finalizationClause) {
      clauses.push(finalizationClause);
    }
  }

  if (typeof extraClause === "string" && extraClause.length > 0) {
    clauses.push(extraClause);
  }

  if (clauses.length === 0) {
    return "이 워크플로는 보호된 Git 상태 변경 전 승인이 필요하다.";
  }

  return clauses.join(" ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Action-specific builders. Each returns { fields, intentSummary, impactSummary }.
// ─────────────────────────────────────────────────────────────────────────────

function buildBranchExplanation(actionCategory, branchProposal) {
  const targetBranchLabel = redactBranchLabel(branchProposal?.name);
  const currentBranchLabel = redactBranchLabel(branchProposal?.current);
  const branchReasonCode =
    typeof branchProposal?.reason === "string" ? branchProposal.reason : null;

  const fields = {
    targetBranchLabel,
    currentBranchLabel,
    branchReasonCode,
  };

  const intentSummary =
    actionCategory === "branch/create"
      ? `브랜치 ${targetBranchLabel || "(이름 없음)"} 를 새로 만들려고 한다.`
      : `브랜치 ${targetBranchLabel || "(이름 없음)"} 로 전환하려고 한다.`;

  const reasonClause = BRANCH_REASON_CLAUSE[branchReasonCode];
  const impactSummary = reasonClause
    ? `승인 시 ${reasonClause}.`
    : actionCategory === "branch/create"
      ? "승인 시 새로운 로컬 브랜치를 만들어 현재 작업을 분리한다."
      : "승인 시 다른 워크플로용 브랜치로 작업을 전환한다.";

  return { fields, intentSummary, impactSummary };
}

function buildInitExplanation(initProposal, readiness) {
  const directoryLabel = redactDirectoryLabel(initProposal?.directory);
  // Default to "unknown" rather than asserting a specific reason — silently
  // claiming "git-not-initialized" when neither source carries a reason would
  // produce a misleading rationale.
  const repoStateCode =
    typeof readiness?.reason === "string" && readiness.reason.length > 0
      ? readiness.reason
      : typeof initProposal?.reason === "string"
        ? initProposal.reason
        : "unknown";

  const fields = {
    directoryLabel,
    repoStateCode,
  };

  const intentSummary = `${directoryLabel} 위치에 Git 저장소를 초기화하려고 한다.`;
  const impactSummary =
    "승인 시 .git 메타데이터가 생성된다. 원격 연결이나 커밋은 아직 발생하지 않는다.";

  return { fields, intentSummary, impactSummary };
}

function buildCommitExplanation(commitProposal, workflowPolicy) {
  // Story 3.5: surface artifactKinds and pathScopeSummary so the approval body
  // describes commit scope using categories and `git log -- <prefix>`-friendly
  // buckets. Per-file basenames must never reach the explanation payload —
  // upstream commit-proposal.js intentionally derives both summaries from
  // matchedFiles before the approval explanation runs.
  const rawArtifactKinds = Array.isArray(commitProposal?.artifactKinds)
    ? commitProposal.artifactKinds.filter((kind) => typeof kind === "string" && kind.length > 0)
    : [];
  const rawPathScopeSummary = Array.isArray(commitProposal?.pathScopeSummary)
    ? commitProposal.pathScopeSummary
        .filter(
          (entry) =>
            entry &&
            typeof entry.prefix === "string" &&
            entry.prefix.length > 0 &&
            typeof entry.label === "string" &&
            entry.label.length > 0 &&
            Number.isInteger(entry.count) &&
            entry.count > 0,
        )
        .map((entry) => ({ prefix: entry.prefix, label: entry.label, count: entry.count }))
    : [];

  const fields = {
    artifactScope:
      typeof commitProposal?.artifactScope === "string"
        ? commitProposal.artifactScope
        : "workflow-generated artifacts",
    changeCountSummary:
      typeof commitProposal?.changeCountSummary === "string"
        ? commitProposal.changeCountSummary
        : null,
    finalizationMode: workflowPolicy?.finalization || null,
    artifactKinds: rawArtifactKinds,
    pathScopeSummary: rawPathScopeSummary,
  };

  // Story 3.2 review (LOW Round 4): surface artifactScope and changeCountSummary
  // directly in the visible prompt body so users can act on the scope without
  // depending on the runtime UI rendering metadata.fields.
  const scopeSegment = fields.changeCountSummary
    ? `${fields.artifactScope}, ${fields.changeCountSummary}`
    : fields.artifactScope;
  const intentSummary = `워크플로에서 산출된 변경(${scopeSegment})을 커밋으로 남기려고 한다.`;
  const finalizationSegment = fields.finalizationMode
    ? ` 최종화 모드: ${fields.finalizationMode}.`
    : "";
  // Story 3.5: append a reviewer-facing scope clause that points to standard
  // Git inspection commands. The clause uses the same path buckets the
  // reviewer can paste into `git log -- <prefix>`.
  const reviewerSegment =
    rawPathScopeSummary.length > 0
      ? ` 리뷰어는 표준 Git 도구로 ${rawPathScopeSummary
          .map((entry) => `${entry.prefix} (${entry.count})`)
          .join(", ")} 경로 이력을 확인할 수 있다.`
      : "";
  const impactSummary = `승인 시 staged/eligible 변경이 단일 커밋 기록으로 추가된다. 푸시는 별도 승인이다.${finalizationSegment}${reviewerSegment}`;

  return { fields, intentSummary, impactSummary };
}

function buildPushExplanation(pushProposal, workflowPolicy) {
  const fields = {
    targetRemoteLabel: redactRemoteLabel(pushProposal?.remote ?? pushProposal?.remoteName),
    targetBranchLabel: redactBranchLabel(pushProposal?.branch ?? pushProposal?.branchName),
    finalizationMode: workflowPolicy?.finalization || null,
  };

  const intentSummary = "로컬 커밋을 설정된 원격 브랜치에 게시하려고 한다.";
  const impactSummary =
    "승인 시 로컬 커밋이 설정된 원격 브랜치로 푸시되어 외부에서 보이게 된다.";

  return { fields, intentSummary, impactSummary };
}

function fallbackExplanation() {
  return {
    fields: {},
    intentSummary: "Git 작업에 사용자 승인이 필요하다.",
    impactSummary: "승인 시 워크플로가 다음 단계를 진행한다.",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the canonical approval explanation payload.
 *
 * @param {{
 *   actionCategory: string,
 *   workflowContext?: object | null,
 *   workflowPolicy?: object | null,
 *   branchProposal?: object | null,
 *   initProposal?: object | null,
 *   readiness?: object | null,
 *   commitProposal?: object | null,
 *   pushProposal?: object | null
 * }} params
 * @returns {{
 *   actionCategory: string,
 *   intentSummary: string,
 *   impactSummary: string,
 *   workflowSummary: string,
 *   policyRationale: string,
 *   sensitivity: "sanitized",
 *   detailLevel: "concise",
 *   fields: object
 * }}
 */
export function buildApprovalExplanation({
  actionCategory,
  workflowContext = null,
  workflowPolicy = null,
  branchProposal = null,
  initProposal = null,
  readiness = null,
  commitProposal = null,
  pushProposal = null,
} = {}) {
  let actionPart;
  let extraPolicyClause = null;

  switch (actionCategory) {
    case "branch/create":
    case "branch/switch":
      actionPart = buildBranchExplanation(actionCategory, branchProposal);
      break;
    case "init":
      actionPart = buildInitExplanation(initProposal, readiness);
      extraPolicyClause = READINESS_RATIONALE[actionPart.fields.repoStateCode] || null;
      break;
    case "commit":
      actionPart = buildCommitExplanation(commitProposal, workflowPolicy);
      break;
    case "push":
      actionPart = buildPushExplanation(pushProposal, workflowPolicy);
      break;
    default:
      actionPart = fallbackExplanation();
  }

  const workflowSummary = buildWorkflowSummary(workflowContext, workflowPolicy);
  const policyRationale = buildPolicyRationale(workflowPolicy, extraPolicyClause);

  return {
    actionCategory,
    intentSummary: actionPart.intentSummary,
    impactSummary: actionPart.impactSummary,
    workflowSummary,
    policyRationale,
    sensitivity: SENSITIVITY,
    detailLevel: DETAIL_LEVEL,
    fallback: false,
    fields: actionPart.fields,
  };
}

/**
 * Returns a generic safe explanation payload. Used as the fallback when
 * upstream explanation building throws or yields an unusable result. Audit
 * is best-effort and the workflow must not hard-fail on copy generation.
 *
 * The `fallback: true` flag is the only signal that the canonical builder
 * was bypassed — auditors and tests should check this.
 *
 * @param {string} actionCategory
 * @returns {object}
 */
export function buildFallbackExplanation(actionCategory) {
  const safeCategory = typeof actionCategory === "string" ? actionCategory : "unknown";
  const part = fallbackExplanation();
  return {
    actionCategory: safeCategory,
    intentSummary: part.intentSummary,
    impactSummary: part.impactSummary,
    workflowSummary: "워크플로 컨텍스트를 사용할 수 없다.",
    policyRationale: "이 워크플로는 보호된 Git 상태 변경 전 승인이 필요하다.",
    sensitivity: SENSITIVITY,
    detailLevel: DETAIL_LEVEL,
    fallback: true,
    fields: part.fields,
  };
}
