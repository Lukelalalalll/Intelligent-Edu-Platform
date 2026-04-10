import type { ChatMsg } from './types';

export function replaceMessageText(list: ChatMsg[], id: string, text: string): ChatMsg[] {
    return list.map((m) => (m.id === id ? { ...m, text } : m));
}

export function toApiMessages(history: ChatMsg[]): Array<{ role: 'user' | 'assistant'; content: string }> {
    return history.map((m) => ({ role: m.role, content: m.text }));
}
