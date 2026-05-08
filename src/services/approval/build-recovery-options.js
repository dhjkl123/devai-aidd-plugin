/**
 * build-recovery-options.js
 *
 * Story 2.5 — pure builder that produces the action-specific list of recovery
 * options the user can pick from when an action enters `awaitingRecovery`.
 *
 * Each option carries:
 *   - `choice`             : RECOVERY_CHOICES value (machine-readable selector)
 *   - `label`              : short user-facing label
 *   - `instructions`       : actionable guidance the user can follow now
 *   - `nextState`          : the recovery state that will be entered if chosen
 *   - `blockingScope`      : how the gate will block downstream Git automation
 *                             after the choice is recorded
 *
 * Action-kind options are spec-driven (Story 2.5 § Action-Specific Recovery
 * Options). The builder NEVER executes the recovery; it only describes the
 * next state transition that will occur.
 *
 * Boundary: this module must not import the orchestrator and must not look at
 * workflow state. It is a pure mapping (action + recoverability) → list of
 * options.
 */

import {
  BLOCKING_SCOPES,
  RECOVERY_ACTION_KINDS,
  RECOVERY_CHOICES,
  RECOVERY_STATES,
  isRecoveryActionKind,
} from "./recovery-state.js";

const RETRY_OPTION_BASE = {
  choice: RECOVERY_CHOICES.RETRY,
  label: "Retry",
  nextState: RECOVERY_STATES.RETRY_REQUESTED,
};
const CONTINUE_OPTION_BASE = {
  choice: RECOVERY_CHOICES.CONTINUE_WITHOUT_AUTOMATION,
  label: "Continue without automation",
  nextState: RECOVERY_STATES.CONTINUED_WITHOUT_AUTOMATION,
};
const MANUAL_OPTION_BASE = {
  choice: RECOVERY_CHOICES.MANUAL_RESOLUTION,
  label: "Continue after manual resolution",
  nextState: RECOVERY_STATES.AWAITING_MANUAL_RESOLUTION,
};
const ABANDON_OPTION_BASE = {
  choice: RECOVERY_CHOICES.ABANDON,
  label: "Stop automation",
  nextState: RECOVERY_STATES.ABANDONED,
};

function buildBranchOptions(operation) {
  const verb = operation === "switch" ? "switch to" : "create";
  return [
    {
      ...RETRY_OPTION_BASE,
      instructions: `Retry the branch ${operation || "operation"} after fixing branch state, naming input, or any conflicting branch.`,
      blockingScope: BLOCKING_SCOPES.GIT_ONLY,
    },
    {
      ...CONTINUE_OPTION_BASE,
      instructions:
        "Stay on the current branch and continue the workflow without enforcing branch policy for this session.",
      blockingScope: BLOCKING_SCOPES.GIT_ONLY,
    },
    {
      ...MANUAL_OPTION_BASE,
      instructions: `Manually ${verb} the expected branch outside the plugin, then ask the workflow to continue.`,
      blockingScope: BLOCKING_SCOPES.GIT_ONLY,
    },
  ];
}

function buildInitOptions() {
  return [
    {
      ...RETRY_OPTION_BASE,
      instructions:
        "Retry repository readiness after fixing the environment (install Git, ensure the working directory is writable, etc.).",
      blockingScope: BLOCKING_SCOPES.SESSION_GIT,
    },
    {
      ...CONTINUE_OPTION_BASE,
      instructions:
        "Disable Git automation for the rest of this session because the repository prerequisite is still absent.",
      blockingScope: BLOCKING_SCOPES.SESSION_GIT,
    },
    {
      ...MANUAL_OPTION_BASE,
      instructions:
        "Run `git init` manually outside the plugin, then ask the workflow to revalidate readiness before later Git actions.",
      blockingScope: BLOCKING_SCOPES.SESSION_GIT,
    },
  ];
}

function buildCommitOptions() {
  return [
    {
      ...RETRY_OPTION_BASE,
      instructions:
        "Retry commit preparation after fixing preconditions (stage changes, fix the pre-commit hook, resolve the working-tree state).",
      blockingScope: BLOCKING_SCOPES.WORKFLOW_FINALIZATION,
    },
    {
      ...CONTINUE_OPTION_BASE,
      instructions:
        "Complete the BMAD workflow without an automatic commit; finalization will skip commit creation.",
      blockingScope: BLOCKING_SCOPES.WORKFLOW_FINALIZATION,
    },
    {
      ...MANUAL_OPTION_BASE,
      instructions:
        "Commit the artifacts manually outside the plugin, then ask the workflow to continue from a committed state.",
      blockingScope: BLOCKING_SCOPES.WORKFLOW_FINALIZATION,
    },
  ];
}

function buildPushOptions() {
  return [
    {
      ...RETRY_OPTION_BASE,
      instructions:
        "Retry the push after fixing authentication, network, upstream, or remote sync issues.",
      blockingScope: BLOCKING_SCOPES.GIT_ONLY,
    },
    {
      ...CONTINUE_OPTION_BASE,
      instructions:
        "Preserve the local commit as successful and finish the workflow without remote publication.",
      blockingScope: BLOCKING_SCOPES.GIT_ONLY,
    },
    {
      ...MANUAL_OPTION_BASE,
      instructions:
        "Push manually outside the plugin, then ask the workflow to continue from a pushed state.",
      blockingScope: BLOCKING_SCOPES.GIT_ONLY,
    },
  ];
}

/**
 * Build the recovery options for an action. When the failure is non-recoverable
 * (`recoverable: false`), the returned list contains only the `abandon` option
 * because no continuation path is safe.
 *
 * @param {{
 *   actionKind: string,
 *   operation?: string | null,
 *   recoverable: boolean,
 *   recommendedChoice?: string | null
 * }} params
 * @returns {Array<{
 *   choice: string,
 *   label: string,
 *   instructions: string,
 *   nextState: string,
 *   blockingScope: string,
 *   recommended?: boolean
 * }>}
 */
export function buildRecoveryOptions({
  actionKind,
  operation = null,
  recoverable,
  recommendedChoice = null,
}) {
  if (recoverable !== true) {
    return [
      {
        ...ABANDON_OPTION_BASE,
        instructions:
          "The plugin cannot continue automation safely. Stop the automation path; subsequent unrelated work can still proceed.",
        blockingScope: BLOCKING_SCOPES.GIT_ONLY,
        recommended: true,
      },
    ];
  }

  if (!isRecoveryActionKind(actionKind)) {
    // Without a recognised action kind we cannot describe a safe next step.
    return [
      {
        ...ABANDON_OPTION_BASE,
        instructions:
          "The action kind is not recognised by recovery; stop the automation path for this action.",
        blockingScope: BLOCKING_SCOPES.GIT_ONLY,
        recommended: true,
      },
    ];
  }

  let options;
  if (actionKind === RECOVERY_ACTION_KINDS.BRANCH) {
    options = buildBranchOptions(operation);
  } else if (actionKind === RECOVERY_ACTION_KINDS.INIT) {
    options = buildInitOptions();
  } else if (actionKind === RECOVERY_ACTION_KINDS.COMMIT) {
    options = buildCommitOptions();
  } else {
    options = buildPushOptions();
  }

  if (typeof recommendedChoice === "string" && recommendedChoice.length > 0) {
    return options.map((opt) =>
      opt.choice === recommendedChoice ? { ...opt, recommended: true } : opt,
    );
  }
  return options;
}
