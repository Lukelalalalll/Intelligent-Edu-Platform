import client from '@/shared/api/client';

export interface ToolSummary {
    tool: string;
    label: string;
    count: number;
}

export interface HistoryItem {
    id: string;
    tool: string;
    params: Record<string, unknown>;
    preview: string;
    source: Record<string, unknown>;
    created_at: string;
}

export interface HistoryDetail extends HistoryItem {
    result: unknown;
}

export interface AdminUser {
    id: string;
    username: string;
    email: string;
    role: string;
}

export const fileCenterHistoryApi = {
    // ── User endpoints ──
    async getSummary(): Promise<ToolSummary[]> {
        const res = await client.get('/file-center/tool-history/summary');
        return res.data.tools;
    },

    async getHistory(tool: string, page = 1, pageSize = 10, search = ''): Promise<{ items: HistoryItem[]; total: number }> {
        const res = await client.get('/file-center/tool-history', {
            params: { tool, page, page_size: pageSize, search },
        });
        return res.data;
    },

    async getDetail(tool: string, id: string): Promise<HistoryDetail> {
        const res = await client.get(`/file-center/tool-history/${id}`, {
            params: { tool },
        });
        return res.data;
    },

    async softDelete(tool: string, id: string): Promise<void> {
        await client.delete(`/file-center/tool-history/${id}`, {
            params: { tool },
        });
    },

    async batchDelete(tool: string, ids: string[]): Promise<{ deleted_count: number }> {
        const res = await client.post('/file-center/tool-history/batch-delete', { tool, ids });
        return res.data;
    },

    // ── Admin endpoints ──
    async adminGetUsers(): Promise<AdminUser[]> {
        const res = await client.get('/file-center/admin/tool-history/users');
        return res.data.users;
    },

    async adminGetSummary(userId = ''): Promise<ToolSummary[]> {
        const res = await client.get('/file-center/admin/tool-history/summary', {
            params: { user_id: userId },
        });
        return res.data.tools;
    },

    async adminGetHistory(tool: string, page = 1, pageSize = 10, userId = '', search = ''): Promise<{ items: HistoryItem[]; total: number }> {
        const res = await client.get('/file-center/admin/tool-history', {
            params: { tool, page, page_size: pageSize, user_id: userId, search },
        });
        return res.data;
    },

    async adminHardDelete(tool: string, id: string): Promise<void> {
        await client.delete(`/file-center/admin/tool-history/${id}`, {
            params: { tool },
        });
    },

    async adminBatchDelete(tool: string, ids: string[]): Promise<{ deleted_count: number }> {
        const res = await client.post('/file-center/admin/tool-history/batch-delete', { tool, ids });
        return res.data;
    },
};
