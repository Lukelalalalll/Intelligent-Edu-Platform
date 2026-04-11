/**
 * Extract a human-readable error message from Axios / generic errors.
 *
 * Handles:
 * - FastAPI validation-error arrays (detail: [{loc, msg}])
 * - FastAPI string detail
 * - Generic `.response.data.error`
 * - Native Error `.message`
 * - Fallback string
 */
export function extractErrorMessage(err: unknown, fallback = 'Unknown error'): string {
    const maybeAxios = err as {
        response?: { data?: { detail?: unknown; error?: string } };
        message?: string;
    };
    const detail = maybeAxios?.response?.data?.detail;
    if (Array.isArray(detail)) {
        return detail
            .map((d: { loc?: string[]; msg?: string }) => `${(d.loc || []).join('.')}: ${d.msg}`)
            .join('; ');
    }
    if (typeof detail === 'string' && detail.trim()) return detail;
    if (typeof maybeAxios?.response?.data?.error === 'string') return maybeAxios.response.data.error;
    if (typeof maybeAxios?.message === 'string' && maybeAxios.message.trim()) return maybeAxios.message;
    return fallback;
}
