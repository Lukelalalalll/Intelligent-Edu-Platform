import { getErrorMessage } from './sessionHelpers';
import type { NormalizedSessionError, SessionStreamResult } from './sessionManagerTypes';

export const OFFLINE_ASSISTANT_MESSAGE =
    'You appear to be offline. Please check your network connection and try again.';

export function normalizeOfflineSessionError(): NormalizedSessionError {
    return {
        kind: 'offline',
        assistantMessage: OFFLINE_ASSISTANT_MESSAGE,
    };
}

export function normalizeSessionStreamError(
    result: Exclude<SessionStreamResult, { kind: 'success' }>,
): NormalizedSessionError {
    switch (result.kind) {
        case 'api_error':
            return {
                kind: 'api_error',
                assistantMessage: `API Error: ${result.statusCode}`,
            };
        case 'empty_body':
            return {
                kind: 'empty_body',
                assistantMessage: 'Error: Empty response body from server.',
            };
        case 'aborted':
            return { kind: 'aborted' };
    }
}

export function normalizeThrownSessionError(err: unknown): NormalizedSessionError {
    if ((err as { name?: string } | null)?.name === 'AbortError') {
        return { kind: 'aborted' };
    }

    return {
        kind: 'network_error',
        assistantMessage: `Network Error: ${getErrorMessage(err)}`,
    };
}
