type ErrorResponseLike = {
    status?: number;
    data?: unknown;
};

type RequestErrorLike = {
    message?: string;
    response?: ErrorResponseLike;
};

function readDetail(data: unknown): string {
    if (!data) return '';
    if (typeof data === 'string') return data.trim();
    if (typeof data !== 'object') return '';

    const record = data as Record<string, unknown>;
    const detail = record.detail;
    if (typeof detail === 'string') return detail.trim();
    if (Array.isArray(detail) && detail.length > 0) {
        return detail
            .map((item) => {
                if (typeof item === 'string') return item;
                if (item && typeof item === 'object' && 'msg' in item) {
                    return String((item as { msg?: unknown }).msg || '');
                }
                return '';
            })
            .filter(Boolean)
            .join('; ');
    }

    const error = record.error;
    if (typeof error === 'string') return error.trim();
    const message = record.message;
    if (typeof message === 'string') return message.trim();
    return '';
}

function isGenericHttpMessage(message: string): boolean {
    return /^request failed with status code \d+$/i.test(message.trim());
}

function readStatusFromMessage(message: string): number {
    const match = message.match(/status code\s+(\d+)/i);
    return match ? Number(match[1]) : 0;
}

export function getQuestionRequestErrorMessage(error: unknown, fallback: string): string {
    const requestError = (typeof error === 'object' && error !== null ? error : {}) as RequestErrorLike;
    const rawMessage = error instanceof Error
        ? error.message.trim()
        : typeof requestError.message === 'string'
            ? requestError.message.trim()
            : '';
    const status = Number(requestError.response?.status || readStatusFromMessage(rawMessage) || 0);
    const detail = readDetail(requestError.response?.data);

    if (status === 401) {
        return 'Please log in again to use Question Studio.';
    }
    if (status === 403) {
        return 'You do not have permission to use this Question Studio action.';
    }
    if (status === 404) {
        if (detail && !/^not found$/i.test(detail)) return detail;
        return 'Question Studio could not find the required API route. Refresh the app or restart the backend, then try again.';
    }
    if (status >= 500) {
        if (detail) return detail;
        return 'Question Studio server is unavailable right now. Please try again after the backend is healthy.';
    }
    if (detail) return detail;
    if (rawMessage && !isGenericHttpMessage(rawMessage)) return rawMessage;
    return fallback;
}
