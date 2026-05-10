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
