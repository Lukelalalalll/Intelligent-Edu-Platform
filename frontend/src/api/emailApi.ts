import client from './client';
import type { EmailListResponse, EmailDetail, EmailClassification } from '../types/api';

export const gmailApi = {
    list: (pageToken?: string): Promise<EmailListResponse> => {
        const params = pageToken ? { page_token: pageToken } : {};
        return client.get('/email/list', { params }).then(r => r.data);
    },
    getDetail: (emailId: string): Promise<{ email: EmailDetail }> => client.get(`/email/message/${emailId}`).then(r => r.data),
    classify: (payload: { messageId: string; subject?: string; body?: string; sender?: string }): Promise<{ classification: EmailClassification }> => client.post('/email/classify', payload).then(r => r.data),
    getAuthUrl: (): Promise<{ auth_url: string }> => client.get('/email/auth_url').then(r => r.data),
    callback: (code: string, state: string | null) => client.post('/email/callback', { code, state }).then(r => r.data),
    disconnect: () => client.post('/email/disconnect').then(r => r.data),
    reply: (payload: { threadId?: string; messageId: string; to: string; subject: string; body: string; inReplyTo?: string }) => client.post('/email/reply', payload).then(r => r.data),
    suggestReply: (emailId: string, payload: { subject?: string; body?: string; sender?: string }): Promise<{ suggestion: string }> => client.post(`/email/suggest_reply/${emailId}`, payload).then(r => r.data),
};
