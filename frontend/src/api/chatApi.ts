// frontend/src/api/chatApi.ts

import client from './client';
import type { ChatContact, CourseInfo, FriendRequest, ChatRoom, ChatMessage } from '../features/chat/types';
import type { AIProvider } from '../shared/aiProvider';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1']);

const resolveApiRoot = (): string => {
  const raw = String(import.meta.env.VITE_API_ROOT || 'http://localhost:5009').trim();
  try {
    const parsed = new URL(raw);
    const browserHost = window.location.hostname;
    if (LOOPBACK_HOSTS.has(parsed.hostname) && LOOPBACK_HOSTS.has(browserHost) && parsed.hostname !== browserHost) {
      parsed.hostname = browserHost;
    }
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return raw.replace(/\/$/, '');
  }
};

const toAbsoluteFileUrl = (fileUrl: string): string => {
  if (!fileUrl) return '';
  const raw = String(fileUrl).trim();
  const isAbsolute = /^https?:\/\//i.test(raw);

  if (!isAbsolute) {
    // In dev, never rely on Vite /static proxy target; resolve via API root directly.
    const normalized = raw.startsWith('/') ? raw : `/${raw}`;
    return `${resolveApiRoot()}${normalized}`;
  }

  try {
    const parsed = new URL(raw);
    const browserHost = window.location.hostname;
    if (LOOPBACK_HOSTS.has(parsed.hostname) && LOOPBACK_HOSTS.has(browserHost) && parsed.hostname !== browserHost) {
      parsed.hostname = browserHost;
    }
    return parsed.toString();
  } catch {
    const normalized = raw.startsWith('/') ? raw : `/${raw}`;
    return `${resolveApiRoot()}${normalized}`;
  }
};

const fetchFileBlob = async (fileUrl: string): Promise<Blob> => {
  const absoluteUrl = toAbsoluteFileUrl(fileUrl);
  const resp = await fetch(absoluteUrl, {
    credentials: 'include',
    headers: {
      Accept: 'application/octet-stream,application/pdf,image/*,*/*',
    },
  });
  if (!resp.ok) throw new Error(`Failed to fetch file: ${resp.status}`);

  const contentType = (resp.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('text/html')) {
    throw new Error('Received HTML instead of file content (auth or URL mismatch).');
  }
  return await resp.blob();
};

const ensureFilenameExtension = (name: string, extHint?: string): string => {
  const baseName = String(name || 'file').trim() || 'file';
  const ext = String(extHint || '').trim().toLowerCase();
  if (!ext) return baseName;
  if (baseName.toLowerCase().endsWith(`.${ext}`)) return baseName;
  if (!baseName.includes('.')) return `${baseName}.${ext}`;
  return `${baseName}.${ext}`;
};

// ── AI Assistant Types ──
export interface AiSummaryResult {
  ok: boolean;
  summary: string;
  mode: string;
  message_count: number;
}

export interface AiReplySuggestionsResult {
  ok: boolean;
  suggestions: string[];
}

export interface AiRewriteResult {
  ok: boolean;
  rewritten_text: string;
}

export interface AiAssistantResult {
  ok: boolean;
  answer: string;
}

// ── Transfer Types ──
export interface TransferStartResult {
  ok: boolean;
  transfer_id: string;
  status: string;
  redirect_url: string;
  target_module: string;
}

export interface TransferStatus {
  ok: boolean;
  transfer: {
    transfer_id: string;
    status: string;
    target_module: string;
    file_meta: { name: string; ext: string; size: number; mime: string };
    target_options: Record<string, unknown>;
    error_message?: string;
    created_at: string;
    consumed_at?: string | null;
    expires_at: string;
  };
}

export interface TransferConsumeResult {
  ok: boolean;
  transfer_id: string;
  status: string;
  file_meta: { name: string; ext: string; size: number; mime: string };
  source_file_url: string;
  target_module: string;
  target_options: Record<string, unknown>;
}

export const chatApi = {
  toAbsoluteFileUrl,

  fetchFileBlob,

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

  // ── Room Info & Management ──
  getRoomInfo: (roomId: string): Promise<{
    ok: boolean;
    room: ChatRoom;
    members: ChatContact[];
    isOwner: boolean;
  }> => client.get(`/chat/rooms/${roomId}/info`).then(r => r.data),

  addRoomMember: (roomId: string, userId: string): Promise<{ ok: boolean }> =>
    client.post(`/chat/rooms/${roomId}/members/add`, { userId }).then(r => r.data),

  kickRoomMember: (roomId: string, userId: string): Promise<{ ok: boolean }> =>
    client.post(`/chat/rooms/${roomId}/members/kick`, { userId }).then(r => r.data),

  leaveRoom: (roomId: string): Promise<{ ok: boolean }> =>
    client.post(`/chat/rooms/${roomId}/leave`).then(r => r.data),

  deleteRoom: (roomId: string): Promise<{ ok: boolean }> =>
    client.delete(`/chat/rooms/${roomId}`).then(r => r.data),

  // ── AI Assistant ──
  aiSummary: (
    roomId: string,
    mode = 'summary',
    windowSize = 30,
    unreadSince?: string,
    provider: AIProvider = 'local_ollama',
  ): Promise<AiSummaryResult> =>
    client.post(`/chat/rooms/${roomId}/ai/summary`, {
      mode, window_size: windowSize, unread_since: unreadSince, provider,
    }).then(r => r.data),

  aiReplySuggestions: (
    roomId: string,
    tone = 'concise',
    latestCount = 10,
    provider: AIProvider = 'local_ollama',
  ): Promise<AiReplySuggestionsResult> =>
    client.post(`/chat/rooms/${roomId}/ai/reply-suggestions`, {
      tone, latest_count: latestCount, provider,
    }).then(r => r.data),

  aiRewrite: (
    roomId: string,
    draftText: string,
    style = 'concise',
    provider: AIProvider = 'local_ollama',
  ): Promise<AiRewriteResult> =>
    client.post(`/chat/rooms/${roomId}/ai/rewrite`, {
      draft_text: draftText, style, provider,
    }).then(r => r.data),

  aiAssistant: (
    roomId: string,
    query: string,
    contextWindow = 20,
    provider: AIProvider = 'local_ollama',
  ): Promise<AiAssistantResult> =>
    client.post(`/chat/rooms/${roomId}/ai/assistant`, {
      query, context_window: contextWindow, provider,
    }).then(r => r.data),

  // ── Transfer Station ──
  transferStart: (
    roomId: string, messageId: string, targetModule: string,
    targetOptions: Record<string, unknown> = {},
  ): Promise<TransferStartResult> =>
    client.post('/chat/transfers/start', {
      room_id: roomId, message_id: messageId,
      target_module: targetModule, target_options: targetOptions,
    }).then(r => r.data),

  transferGet: (transferId: string): Promise<TransferStatus> =>
    client.get(`/chat/transfers/${transferId}`).then(r => r.data),

  transferConsume: (transferId: string): Promise<TransferConsumeResult> =>
    client.post(`/chat/transfers/${transferId}/consume`).then(r => r.data),

  transferRetry: (transferId: string): Promise<TransferConsumeResult> =>
    client.post(`/chat/transfers/${transferId}/retry`).then(r => r.data),

  /**
   * Consume a transfer and download the file as a File object ready for upload.
   * Returns the File + metadata from the transfer ticket.
   */
  transferConsumeAndDownload: async (transferId: string): Promise<{
    file: File;
    meta: TransferConsumeResult;
  }> => {
    const meta = await client.post(`/chat/transfers/${transferId}/consume`).then(r => r.data) as TransferConsumeResult;
    const blob = await fetchFileBlob(meta.source_file_url);
    const normalizedName = ensureFilenameExtension(meta.file_meta.name || 'file', meta.file_meta.ext);
    const file = new File([blob], normalizedName, { type: meta.file_meta.mime });
    return { file, meta };
  },
};
