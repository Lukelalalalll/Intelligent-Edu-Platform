// frontend/src/features/chat/types.ts

export interface ChatContact {
  id: string;
  username: string;
  email: string;
  role: 'student' | 'teacher' | 'admin';
}

export interface FriendRequest {
  id: string;
  fromId: string;
  fromUsername: string;
  fromEmail: string;
  fromRole: string;
  sentAt: string;
}

export interface ChatLastMessage {
  content: string;
  senderId: string;
  sentAt: string;
  readBy?: string[];
}

export interface ChatRoom {
  id: string;
  type: 'direct' | 'group';
  name: string | null;
  members: string[];
  createdBy: string;
  avatarColor: string | null;
  createdAt: string;
  lastMessage: ChatLastMessage | null;
  unreadCount?: number;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  content: string;
  type: 'text' | 'system';
  messageType?: 'text' | 'file';
  recalled?: boolean;
  failed?: boolean;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  replyTo?: { id: string; senderName: string; content: string } | null;
  forwardedFrom?: string | null;
  readBy: string[];
  sentAt: string;
}

export type WsStatus = 'connecting' | 'open' | 'closed';

export interface WsEvent {
  type: string;
  [key: string]: unknown;
}

export interface CourseInfo {
  id: string;
  name: string;
  existingRoomId: string | null;
}
