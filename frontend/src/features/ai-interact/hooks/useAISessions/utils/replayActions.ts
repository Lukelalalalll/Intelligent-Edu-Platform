import type { SessionListState, SessionState } from './sessionManagerTypes';

export function resolveTargetSession(
    currentSessionId: string | null,
    sessions: SessionListState,
): { targetId: string | null; session: SessionState | null } {
    const targetId = currentSessionId || (sessions || [])[0]?.id || null;
    if (!targetId) {
        return { targetId: null, session: null };
    }

    const session = (sessions || []).find((item) => item.id === targetId) || null;
    return { targetId, session };
}
