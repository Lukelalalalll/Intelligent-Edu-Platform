// frontend/src/api/chatApi.ts

import client from './client';
import type { ChatContact, CourseInfo, FriendRequest, ChatRoom, ChatMessage } from '../features/chat/types';

export const chatApi = {
  // ── Contacts ──
  getContacts: (): Promise<{ contacts: ChatContact[] }> =>
    client.get('/chat/contacts').then(r => r.data),

  sendFriendRequest: (targetUsername: string) =>
    client.post('/chat/contacts/request', { targetUsername }).then(r => r.data),

  getFriendRequests: (): Promise<{ requests: FriendRequest[] }> =>
    client.get('/chat/contacts/requests').then(r => r.data),

  acceptFriendRequest: (contactId: string) =>
    client.post(`/chat/contacts/${contactId}/accept`).then(r => r.data),

  deleteContact: (contactId: string) =>
    client.delete(`/chat/contacts/${contactId}`).then(r => r.data),

  searchUsers: (q: string): Promise<{ users: ChatContact[] }> =>
    client.get('/chat/users/search', { params: { q } }).then(r => r.data),

  // ── Rooms ──
  getRooms: (): Promise<{ rooms: ChatRoom[] }> =>
    client.get('/chat/rooms').then(r => r.data),

  createGroupRoom: (name: string, memberIds: string[]) =>
    client.post('/chat/rooms', { name, memberIds }).then(r => r.data),

  createOrGetDirectRoom: (targetUserId: string): Promise<{ ok: boolean; roomId: string }> =>
    client.post('/chat/rooms/direct', { targetUserId }).then(r => r.data),

  // ── Messages ──
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
    }).then(r => r.data);  // Keep fileUrl as relative path (/static/...) — Vite proxy makes it same-origin
  },

  getCourseList: (): Promise<{ courses: CourseInfo[] }> =>
    client.get('/chat/rooms/from-course/list').then(r => r.data),

  createCourseGroup: (courseId: string): Promise<{ ok: boolean; roomId: string }> =>
    client.post('/chat/rooms/from-course', { courseId }).then(r => r.data),
};
