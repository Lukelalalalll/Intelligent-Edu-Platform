import client from '../../../api/client';

// ── Shared file utilities ──
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

export const toAbsoluteFileUrl = (fileUrl: string): string => {
    if (!fileUrl) return '';
    const raw = String(fileUrl).trim();
    const isAbsolute = /^https?:\/\//i.test(raw);
    if (!isAbsolute) {
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

export const fetchFileBlob = async (fileUrl: string): Promise<Blob> => {
    const absoluteUrl = toAbsoluteFileUrl(fileUrl);
    const resp = await fetch(absoluteUrl, {
        credentials: 'include',
        headers: { Accept: 'application/octet-stream,application/pdf,image/*,*/*' },
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

export const transferApi = {
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
