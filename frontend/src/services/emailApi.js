import client from '../api/client';

export const gmailApi = {
    list: (pageToken) => {
        const params = pageToken ? { page_token: pageToken } : {};
        return client.get('/gmail/list', { params }).then(r => r.data);
    },
    getDetail: (emailId) => client.get(`/gmail/message/${emailId}`).then(r => r.data),
    classify: (payload) => client.post('/gmail/classify', payload).then(r => r.data),
    getAuthUrl: () => client.get('/gmail/auth_url').then(r => r.data),
    callback: (code, state) => client.post('/gmail/callback', { code, state }).then(r => r.data),
    disconnect: () => client.post('/gmail/disconnect').then(r => r.data),
    reply: (payload) => client.post('/gmail/reply', payload).then(r => r.data),
    suggestReply: (emailId, payload) => client.post(`/gmail/suggest_reply/${emailId}`, payload).then(r => r.data),
};
