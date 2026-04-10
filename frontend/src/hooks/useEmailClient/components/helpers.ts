import type { AIProvider } from '../../../shared/aiProvider';
import type { EmailDetail } from '../../../types/api';

export function extractError(err: unknown, fallback: string): string {
    const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
    return typeof detail === 'string' ? detail : fallback;
}

export function parseSenderEmail(from?: string): string {
    const value = from || '';
    return value.match(/<([^>]+)>/)?.[1] || value;
}

export function normalizeReplySubject(subject?: string): string {
    const base = (subject || '').replace(/^(Re:\s*)+/i, '').trim();
    return `Re: ${base}`;
}

export function buildClassifyPayload(emailId: string, detail: EmailDetail | null, provider: AIProvider) {
    const payload: { messageId: string; subject?: string; body?: string; sender?: string; provider?: AIProvider } = { messageId: emailId };
    payload.provider = provider;
    if (detail) {
        payload.subject = detail.subject || '';
        payload.body = detail.bodyText || detail.snippet || '';
        payload.sender = detail.from || '';
    }
    return payload;
}

export function buildSuggestPayload(detail: EmailDetail | null, provider: AIProvider): Record<string, string> {
    const payload: Record<string, string> = { provider };
    if (detail) {
        payload.subject = detail.subject || '';
        payload.body = detail.bodyText || detail.snippet || '';
        payload.sender = detail.from || '';
    }
    return payload;
}
