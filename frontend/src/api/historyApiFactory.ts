/**
 * historyApiFactory — eliminates 6× duplicate getGenerationHistory / getGenerationDetail / replayGeneration.
 * Each domain calls `createHistoryApi('/diagram')` to get a typed history API scoped to its URL prefix.
 */
import client from './client';

export interface GenerationHistoryPage<T = any> {
    items: T[];
    total: number;
}

export interface HistoryApiMethods<T = any> {
    getGenerationHistory: (page?: number, pageSize?: number) => Promise<GenerationHistoryPage<T>>;
    getGenerationDetail: (historyId: string) => Promise<T>;
    replayGeneration: (historyId: string) => Promise<{ tool: string; params: Record<string, unknown>; data: Record<string, unknown> }>;
}

export function createHistoryApi<T = any>(prefix: string): HistoryApiMethods<T> {
    return {
        async getGenerationHistory(page = 1, pageSize = 10) {
            const res = await client.get(`${prefix}/generation_history`, {
                params: { page, page_size: pageSize },
            });
            return res.data;
        },
        async getGenerationDetail(historyId: string) {
            const res = await client.get(`${prefix}/generation_history/${historyId}`);
            return res.data;
        },
        async replayGeneration(historyId: string) {
            const res = await client.post(`${prefix}/generation_history/${historyId}/replay`);
            return res.data;
        },
    };
}
