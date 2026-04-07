// frontend/src/features/chat/store/chatStore.ts

import { create } from 'zustand';
import type { ChatRoom, ChatMessage, ChatContact, FriendRequest, WsStatus } from '../types';

interface ChatStore {
  rooms: ChatRoom[];
  activeRoomId: string | null;
  messages: Record<string, ChatMessage[]>;
  contacts: ChatContact[];
  pendingRequests: FriendRequest[];
  unreadCounts: Record<string, number>;
  wsStatus: WsStatus;
  wsSend: ((data: unknown) => void) | null;

  // Actions
  setRooms: (rooms: ChatRoom[]) => void;
  setActiveRoom: (roomId: string | null) => void;
  setMessages: (roomId: string, msgs: ChatMessage[]) => void;
  prependMessages: (roomId: string, msgs: ChatMessage[]) => void;
  appendMessage: (roomId: string, msg: ChatMessage) => void;
  replaceOptimisticMessage: (roomId: string, localId: string, msg: ChatMessage) => void;
  markMessageFailed: (roomId: string, messageId: string) => void;
  updateRoomLastMessage: (roomId: string, lastMessage: ChatRoom['lastMessage']) => void;
  setContacts: (contacts: ChatContact[]) => void;
  setPendingRequests: (requests: FriendRequest[]) => void;
  incrementUnread: (roomId: string) => void;
  clearUnread: (roomId: string) => void;
  setUnreadCounts: (counts: Record<string, number>) => void;
  setWsStatus: (status: WsStatus) => void;
  setWsSend: (fn: ((data: unknown) => void) | null) => void;
  recallMessage: (roomId: string, messageId: string) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  rooms: [],
  activeRoomId: null,
  messages: {},
  contacts: [],
  pendingRequests: [],
  unreadCounts: {},
  wsStatus: 'closed',
  wsSend: null,

  setRooms: (rooms) => set({ rooms }),

  setActiveRoom: (roomId) => set({ activeRoomId: roomId }),

  setMessages: (roomId, msgs) =>
    set((state) => ({
      messages: { ...state.messages, [roomId]: msgs },
    })),

  prependMessages: (roomId, msgs) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [roomId]: [...msgs, ...(state.messages[roomId] || [])],
      },
    })),

  appendMessage: (roomId, msg) =>
    set((state) => {
      const existing = state.messages[roomId] || [];
      // Avoid duplicates
      if (existing.some((m) => m.id === msg.id)) return state;
      return {
        messages: { ...state.messages, [roomId]: [...existing, msg] },
      };
    }),

  replaceOptimisticMessage: (roomId, localId, msg) =>
    set((state) => {
      const existing = state.messages[roomId] || [];
      const idx = existing.findIndex((m) => m.id === localId);
      if (idx === -1) {
        // Optimistic message already gone — just append if not duplicate
        if (existing.some((m) => m.id === msg.id)) return state;
        return {
          messages: { ...state.messages, [roomId]: [...existing, msg] },
        };
      }
      const updated = [...existing];
      updated[idx] = msg;
      return {
        messages: { ...state.messages, [roomId]: updated },
      };
    }),

  markMessageFailed: (roomId, messageId) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [roomId]: (state.messages[roomId] || []).map((m) =>
          m.id === messageId ? { ...m, failed: true } : m
        ),
      },
    })),

  updateRoomLastMessage: (roomId, lastMessage) =>
    set((state) => ({
      rooms: state.rooms.map((r) =>
        r.id === roomId ? { ...r, lastMessage } : r,
      ),
    })),

  setContacts: (contacts) => set({ contacts }),

  setPendingRequests: (requests) => set({ pendingRequests: requests }),

  incrementUnread: (roomId) =>
    set((state) => ({
      unreadCounts: {
        ...state.unreadCounts,
        [roomId]: (state.unreadCounts[roomId] || 0) + 1,
      },
    })),

  clearUnread: (roomId) =>
    set((state) => ({
      unreadCounts: { ...state.unreadCounts, [roomId]: 0 },
    })),

  setUnreadCounts: (counts) =>
    set((state) => ({
      // Merge: server values override existing zeros, but don't clobber WS increments that happened since load
      unreadCounts: { ...state.unreadCounts, ...counts },
    })),

  setWsStatus: (wsStatus) => set({ wsStatus }),

  setWsSend: (fn) => set({ wsSend: fn }),

  recallMessage: (roomId, messageId) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [roomId]: (state.messages[roomId] || []).map((m) =>
          m.id === messageId ? { ...m, recalled: true } : m
        ),
      },
    })),
}));
