/**
 * permission-asked-aliases.js
 *
 * Story 2.5 (LOW review round 3) — shared alias maps used by
 * `src/hooks/permission-asked.js` to canonicalise the runtime payload.
 *
 * The hook routes `permission.asked` events through TWO disjoint
 * vocabularies:
 *   - APPROVAL_OUTCOME_ALIASES — closes an active approval prompt
 *     (accept | deny | ignore-and-continue)
 *   - RECOVERY_CHOICE_ALIASES — selects a recovery continuation against an
 *     active recovery gate (retry | continue-without-automation |
 *     manual-resolution | abandon)
 *
 * Routing precedence in the hook is recovery-first when a recovery gate is
 * active. That precedence is only safe as long as the two alias key sets stay
 * disjoint — otherwise an approval reply could be silently re-routed to the
 * recovery layer (or vice versa). The disjointness invariant is enforced by a
 * regression test (`verifyPermissionAskedAliasDisjointness`).
 *
 * Extract rationale: keeping these as module-private constants on
 * `permission-asked.js` made the invariant invisible to tests. Lifting them
 * into this tiny pure module preserves encapsulation while letting the
 * regression test prove the invariant from the same source of truth.
 */
import { RECOVERY_CHOICES } from "./recovery-state.js";

export const APPROVAL_OUTCOME_ALIASES = Object.freeze({
  accept: "accept",
  approve: "accept",
  approved: "accept",
  allow: "accept",
  deny: "deny",
  reject: "deny",
  rejected: "deny",
  block: "deny",
  "ignore-and-continue": "ignore-and-continue",
  ignore: "ignore-and-continue",
  skip: "ignore-and-continue",
  // strengthen-approval-prompt-instructions: native question label
  // "Create Baseline Commit (Recommended)" normalizes to
  // "create baseline commit" via normalizeAnswerKey -- map it to ACCEPT
  // so the alias resolves identically to the legacy "Approve" label.
  "create baseline commit": "accept",
  // strengthen-approval-prompt-instructions follow-up: sensitive-files
  // baseline variant. Both ACCEPT-style options resolve to "accept"; the
  // executor disambiguates via `approvalCurrent.userAnswer` to decide
  // whether to append the matched .gitignore rules before committing.
  // "Skip Baseline Commit" maps to IGNORE_AND_CONTINUE so
  // consume-approval-outcome.js can clear the commit proposal slot without
  // opening a recovery gate.
  // Legacy keys kept for one release so older deployed plugins / tests do
  // not break if they round-trip these labels.
  "add to gitignore and commit": "accept",
  "commit anyway": "accept",
  "skip baseline commit": "ignore-and-continue",
  // New unified baseline-commit labels (Cancel -> Skip rename + .gitignore
  // explicit option). The executor branches on `approvalCurrent.userAnswer`
  // to distinguish "Setup .gitignore and Commit" from "Commit Without
  // .gitignore"; both map to ACCEPT here.
  "setup gitignore and commit": "accept",
  "commit without gitignore": "accept",
  // Note: bare "skip" already maps to IGNORE_AND_CONTINUE via
  // APPROVAL_ANSWER_TOKENS / IGNORE_ANSWER_TOKENS in native-event.js, so no
  // separate alias entry is needed here for the Skip option.
});

export const RECOVERY_CHOICE_ALIASES = Object.freeze({
  retry: RECOVERY_CHOICES.RETRY,
  "continue-without-automation": RECOVERY_CHOICES.CONTINUE_WITHOUT_AUTOMATION,
  continue: RECOVERY_CHOICES.CONTINUE_WITHOUT_AUTOMATION,
  bypass: RECOVERY_CHOICES.CONTINUE_WITHOUT_AUTOMATION,
  "manual-resolution": RECOVERY_CHOICES.MANUAL_RESOLUTION,
  manual: RECOVERY_CHOICES.MANUAL_RESOLUTION,
  abandon: RECOVERY_CHOICES.ABANDON,
  stop: RECOVERY_CHOICES.ABANDON,
});
