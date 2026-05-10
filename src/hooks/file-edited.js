/**
 * file-edited.js
 *
 * Story 4.3 — WRAPPER-ONLY hook. There is NO matching legacy core handler in
 * `src/policies/legacy/devai-git-workflo.js` for `file.edited`; this is by
 * design (`WRAPPER_ONLY_HOOK_KEYS` in `src/utils/constants.js`). Touched-file
 * tracking is a wrapper-only responsibility — the FR29 compatibility contract
 * does NOT promise the legacy plugin had an analogous handler. The bootstrap
 * audit `plugin bootstrap registered no-op hooks` documents that asymmetry
 * once per session.
 *
 * Determinism guarantee: when wrapper-side state is missing, the path
 * normalizer returns null, or no `legacyHandlers["file.edited"]` exists
 * (always the case under the current frozen baseline — the legacy core does
 * not implement this key; the fall-through branch is purely defensive
 * against a future legacy core that would re-introduce the key without
 * going through a contract change), this hook returns `undefined` without
 * throwing.
 */

import { normalizeTrackedFileEntry } from "../services/workflow/finalization-artifacts.js";

function recordTouchedFile(workflowState, sessionID, filePath, repositoryRoot) {
  if (!workflowState || typeof sessionID !== "string" || sessionID.length === 0) {
    return;
  }

  const currentState = workflowState.get(sessionID);
  if (!currentState) {
    return;
  }

  const normalizedEntry = normalizeTrackedFileEntry(filePath, repositoryRoot);
  if (!normalizedEntry) {
    return;
  }

  const touchedFiles = Array.isArray(currentState.touchedFiles) ? currentState.touchedFiles : [];
  if (touchedFiles.some((entry) => entry?.path === normalizedEntry.path)) {
    return;
  }

  workflowState.set(sessionID, {
    ...currentState,
    touchedFiles: [...touchedFiles, normalizedEntry],
  });
}

export function createFileEditedHook(legacyHandlers, { workflowState, pluginContext } = {}) {
  return async (input) => {
    recordTouchedFile(
      workflowState,
      input?.sessionID,
      input?.filePath || input?.path || input?.file,
      pluginContext?.directory,
    );

    const handler = legacyHandlers["file.edited"];
    if (typeof handler !== "function") {
      return;
    }

    return handler(input);
  };
}
