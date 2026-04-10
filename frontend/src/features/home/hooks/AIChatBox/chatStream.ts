import type { StreamMessage } from './types';

type StreamParams = {
    apiRoot: string;
    messages: StreamMessage[];
    signal: AbortSignal;
    onTextDelta: (text: string) => void;
    onErrorText?: (text: string) => void;
    parseErrorLogLabel: string;
};

export async function streamChatCompletion({
    apiRoot,
    messages,
    signal,
    onTextDelta,
    onErrorText,
    parseErrorLogLabel,
}: StreamParams): Promise<void> {
    const response = await fetch(`${apiRoot}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
        credentials: 'include',
        signal,
    });

    if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
    }

    if (!response.body) {
        throw new Error('No response body for chat stream');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;

            const dataStr = trimmed.replace('data: ', '');
            if (dataStr === '[DONE]') continue;

            try {
                const obj = JSON.parse(dataStr);
                if (obj.error && onErrorText) {
                    onErrorText(String(obj.error));
                    continue;
                }
                const delta = obj.choices?.[0]?.delta?.content;
                if (delta !== undefined) {
                    onTextDelta(String(delta));
                }
            } catch (err) {
                if (import.meta.env.DEV) {
                    console.debug(parseErrorLogLabel, err);
                }
            }
        }
    }
}
