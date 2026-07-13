export interface ChatMsg {
    id: string;
    sender: 'user' | 'ai';
    role: 'user' | 'assistant';
    text: string;
    modelProvider?: 'coze' | 'local_ollama' | 'deepseek';
    uiElements?: any[];
}

export interface StreamMessage {
    role: 'user' | 'assistant';
    content: string;
}

export function createWelcomeMessage(text: string): ChatMsg {
    return {
        id: 'welcome',
        sender: 'ai',
        role: 'assistant',
        text,
        modelProvider: 'local_ollama',
    };
}
