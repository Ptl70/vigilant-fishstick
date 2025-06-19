
import { ChatSession } from '../types';

export interface DeletionResult {
  updatedSessions: ChatSession[];
  newActiveSessionId: string | null;
}

export const calculateNextStateAfterDeletion = (
  currentSessions: ChatSession[],
  sessionIdToDelete: string,
  currentActiveSessionId: string | null
): DeletionResult => {
  const originalIndexToDelete = currentSessions.findIndex(s => s.id === sessionIdToDelete);
  const updatedSessions = currentSessions.filter(session => session.id !== sessionIdToDelete);
  let newActiveSessionId = currentActiveSessionId;

  if (currentActiveSessionId === sessionIdToDelete) {
    // The active chat was deleted
    if (updatedSessions.length === 0) {
      newActiveSessionId = null; // No chats left
    } else {
      // Try to select the session at the same original index, or the new last one if the deleted was last.
      if (originalIndexToDelete >= 0) { 
        if (originalIndexToDelete < updatedSessions.length) {
          // A session exists at the same original index in the updated list
          newActiveSessionId = updatedSessions[originalIndexToDelete].id;
        } else {
          // The deleted session was the last one (or index is now out of bounds for the updated list)
          // Select the new last session
          newActiveSessionId = updatedSessions[updatedSessions.length - 1].id;
        }
      } else {
        // Fallback: This should ideally not be reached if sessionIdToDelete was a valid active ID.
        // If it is, just select the first available.
        newActiveSessionId = updatedSessions[0].id;
      }
    }
  } else {
    // A non-active chat was deleted, or no active chat was set.
    // The current active ID might still be valid or might have been null.
    if (updatedSessions.length === 0) {
      newActiveSessionId = null; // No chats left, so active must be null.
    } else if (currentActiveSessionId === null) {
      // No active chat was set, but now sessions exist (or still exist after deleting a non-active one).
      newActiveSessionId = updatedSessions[0].id; // Default to the first one.
    } else {
      // An active chat was set, and it wasn't the one deleted.
      // We need to ensure it still exists in the updated list (it should).
      const activeStillExists = updatedSessions.some(s => s.id === currentActiveSessionId);
      if (!activeStillExists) {
        // This case indicates an inconsistency if currentActiveSessionId was valid before.
        // However, as a safeguard, if the active ID is somehow gone, pick the first.
        newActiveSessionId = updatedSessions[0].id; 
      }
      // Otherwise, newActiveSessionId remains currentActiveSessionId (it's still valid).
    }
  }

  return { updatedSessions, newActiveSessionId };
};
