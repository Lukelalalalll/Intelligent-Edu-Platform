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

export const WELCOME_MESSAGE: ChatMsg = {
    id: 'welcome',
    sender: 'ai',
    role: 'assistant',
    text: "Hi there! I'm your HKU AI Assistant. How can I help you with your studies today?",
    modelProvider: 'local_ollama',
};
