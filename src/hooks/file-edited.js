/**
 * file-edited.js
 *
 * Wrapper hook for the `file.edited` runtime channel. Tracks touched files
 * for the active workflow session.
 *
 * Determinism guarantee: when wrapper-side state is missing or the path
 * normalizer returns null, this hook returns `undefined` without throwing.
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

export function createFileEditedHook({ workflowState, pluginContext } = {}) {
  return async (input) => {
    recordTouchedFile(
      workflowState,
      input?.sessionID,
      input?.filePath || input?.path || input?.file,
      pluginContext?.directory,
    );
  };
}
