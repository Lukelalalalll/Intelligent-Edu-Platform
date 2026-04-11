import client from '../../../api/client';
import type { ChatMessage } from '../types';

export const messageApi = {
    getMessages: (roomId: string, before?: string, limit?: number): Promise<{ messages: ChatMessage[]; hasMore: boolean }> =>
        client.get(`/chat/rooms/${roomId}/messages`, { params: { before, limit } }).then(r => r.data),

    sendMessage: (
        roomId: string,
        content: string,
        fileData?: { fileUrl: string; fileName: string; fileSize: number; mimeType: string; messageType: 'file' },
        replyTo?: string,
    ): Promise<{ ok: boolean; message: ChatMessage }> =>
        client.post(`/chat/rooms/${roomId}/messages`, { content, ...fileData, replyTo }).then(r => r.data),

    markRead: (roomId: string) =>
        client.post(`/chat/rooms/${roomId}/read`).then(r => r.data),

    recallMessage: (messageId: string): Promise<{ ok: boolean }> =>
        client.post(`/chat/messages/${messageId}/recall`).then(r => r.data),

    translateMessage: (text: string, targetLang: string): Promise<{ ok: boolean; translated: string }> =>
        client.post('/chat/messages/translate', { text, targetLang }).then(r => r.data),

    batchDeleteMessages: (messageIds: string[]): Promise<{ ok: boolean; deleted: number }> =>
        client.post('/chat/messages/batch-delete', { messageIds }).then(r => r.data),

    forwardMessages: (roomId: string, messageIds: string[]): Promise<{ ok: boolean; forwarded: number }> =>
        client.post(`/chat/rooms/${roomId}/forward`, { messageIds }).then(r => r.data),

    uploadFile: (roomId: string, file: File): Promise<{ fileUrl: string; fileName: string; fileSize: number; mimeType: string }> => {
        const form = new FormData();
        form.append('file', file);
        return client.post(`/chat/rooms/${roomId}/upload`, form, {
            headers: { 'Content-Type': 'multipart/form-data' },
        }).then(r => r.data);
    },
};
