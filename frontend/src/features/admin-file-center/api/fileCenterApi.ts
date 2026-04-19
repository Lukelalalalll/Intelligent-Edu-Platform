import client from '@/shared/api/client';

export type FileAssetStatus = 'active' | 'soft_deleted' | 'hard_deleted';

export interface FileAsset {
    file_id: string;
    file_type: string;
    storage_path: string;
    size: number;
    owner_type: string;
    owner_id: string;
    course_id: string;
    filename: string;
    mime_type: string;
    created_by: string;
    scope?: string;
    room_id?: string;
    user_id?: string;
    session_id?: string;
    conversation_date?: string;
    created_at: string;
    updated_at: string;
    deleted_at?: string | null;
    status: FileAssetStatus;
    exists_on_disk?: boolean;
    metadata?: Record<string, unknown>;
}

export interface FileAuditResult {
    orphan_disk_files: Array<{ file_type: string; storage_path: string; size: number }>;
    dangling_registry: Array<{ file_id: string; file_type: string; storage_path: string }>;
    counts: {
        orphan_disk_files: number;
        dangling_registry: number;
    };
}

export interface ChatRoomAssetSummary {
    room_id: string;
    name: string;
    type: string;
    course_id: string;
    member_count: number;
    asset_count: number;
    created_at?: string;
}

export interface AIFileGroup {
    date: string;
    count: number;
    total_size: number;
    items: FileAsset[];
}

export interface AIUserSummary {
    user_id: string;
    username: string;
    email: string;
    role: 'teacher' | 'student';
    session_count: number;
    asset_count: number;
}

export const fileCenterApi = {
    listAssets: (params: {
        file_type?: string;
        status?: string;
        owner_type?: string;
        course_id?: string;
        created_by?: string;
        q?: string;
        limit?: number;
        skip?: number;
    }) => client.get('/admin/files/assets', { params }).then(r => r.data as { total: number; assets: FileAsset[] }),

    getStats: () => client.get('/admin/files/stats').then(r => r.data as {
        rows: Array<{ file_type: string; status: string; count: number; total_size: number }>;
    }),

    getAudit: () => client.get('/admin/files/audit').then(r => r.data as FileAuditResult),

    softDelete: (fileId: string, reason: string) =>
        client.post(`/admin/files/assets/${encodeURIComponent(fileId)}/soft-delete`, { reason }).then(r => r.data),

    restore: (fileId: string) =>
        client.post(`/admin/files/assets/${encodeURIComponent(fileId)}/restore`).then(r => r.data),

    hardDelete: (fileId: string) =>
        client.post(`/admin/files/assets/${encodeURIComponent(fileId)}/hard-delete`).then(r => r.data),

    listChatRooms: (skip = 0, limit = 10) =>
        client.get('/admin/files/chat/rooms', { params: { skip, limit } }).then(r => r.data as { rooms: ChatRoomAssetSummary[], total: number }),

    listChatRoomAssets: (roomId: string, status?: string) =>
        client.get(`/admin/files/chat/rooms/${encodeURIComponent(roomId)}/assets`, { params: { status } })
            .then(r => r.data as { room: Record<string, unknown>; assets: FileAsset[]; total: number }),

    listAIUsers: (role: 'teacher' | 'student', skip = 0, limit = 10) =>
        client.get('/admin/files/ai/users', { params: { role, skip, limit } }).then(r => r.data as { users: AIUserSummary[], total: number }),

    listAIUserAssets: (userId: string, groupBy: 'day' | 'month' = 'day', status?: string) =>
        client.get(`/admin/files/ai/users/${encodeURIComponent(userId)}/assets`, { params: { group_by: groupBy, status } })
            .then(r => r.data as { user_id: string; group_by: 'day' | 'month'; groups: AIFileGroup[]; total: number }),
};
