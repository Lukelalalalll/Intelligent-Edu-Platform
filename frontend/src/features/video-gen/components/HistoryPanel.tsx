import React from 'react';
import HistoryPanel, { type HistoryApi } from '../../../shared/components/HistoryPanel/HistoryPanel';
import * as api from '../api/videoApi';
import type { GenerationHistoryItem } from '../../../types/api';
import s from '../../../styles/history.module.css';

type VideoHistoryParams = {
    lang?: string;
    provider?: string;
    has_scenes?: boolean;
    scene_count?: number;
    subtitles?: boolean;
    max_segments?: number;
    audience?: string;
};

type VideoHistoryItem = {
    id: string;
    created_at?: string;
    preview?: string;
    params?: VideoHistoryParams;
};

type VideoHistoryDetail = VideoHistoryItem & {
    result?: string;
};

const fmt = (v: string | number | null | undefined, fb = '-') => (v == null ? fb : String(v).trim() || fb);

function asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function toStringOrUndefined(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

function toNumberOrUndefined(value: unknown): number | undefined {
    return typeof value === 'number' ? value : undefined;
}

function toBooleanOrUndefined(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
}

function normalizeParams(value: unknown): VideoHistoryParams | undefined {
    const rec = asRecord(value);
    if (!rec) return undefined;
    return {
        lang: toStringOrUndefined(rec.lang),
        provider: toStringOrUndefined(rec.provider),
        has_scenes: toBooleanOrUndefined(rec.has_scenes),
        scene_count: toNumberOrUndefined(rec.scene_count),
        subtitles: toBooleanOrUndefined(rec.subtitles),
        max_segments: toNumberOrUndefined(rec.max_segments),
        audience: toStringOrUndefined(rec.audience),
    };
}

function normalizeItem(item: GenerationHistoryItem): VideoHistoryItem {
    const rec = asRecord(item);
    return {
        id: item.id,
        created_at: rec ? toStringOrUndefined(rec.created_at) : undefined,
        preview: rec ? toStringOrUndefined(rec.preview) : undefined,
        params: rec ? normalizeParams(rec.params) : undefined,
    };
}

function normalizeDetail(item: GenerationHistoryItem): VideoHistoryDetail {
    const base = normalizeItem(item);
    const rec = asRecord(item);
    return {
        ...base,
        result: rec ? toStringOrUndefined(rec.result) : undefined,
    };
}

function formatDate(value: string | undefined): { title: string; label: string } {
    if (!value) return { title: '-', label: '-' };
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return { title: value, label: value };
    return {
        title: date.toLocaleString(),
        label: date.toLocaleDateString(),
    };
}

const historyApi: HistoryApi<VideoHistoryItem, VideoHistoryDetail> = {
    async getHistory(page, pageSize) {
        const data = await api.getGenerationHistory(page, pageSize);
        return {
            total: data.total,
            items: data.items.map(normalizeItem),
        };
    },
    async getDetail(id) {
        const detail = await api.getGenerationDetail(id);
        return normalizeDetail(detail);
    },
};

export default function VideoHistoryPanel() {
    return (
        <HistoryPanel<VideoHistoryItem, VideoHistoryDetail>
            api={historyApi}
            title="Video History"
            subtitle="Recent video generation records"
            detailTitle="Video Generation Details"
            renderCard={(item) => {
                const date = formatDate(item.created_at);
                return (
                    <>
                        <div className={s.historyItemTopRow}>
                            <div className={s.historyItemSubject}>Video Generation</div>
                            <div className={s.historyItemDate} title={date.title}>{date.label}</div>
                        </div>
                        <div className={s.historyItemChips}>
                            <span className={s.historyChipPrimary}>{fmt(item.params?.lang, 'zh')}</span>
                            <span className={s.historyChip}>{fmt(item.params?.provider)}</span>
                            {item.params?.has_scenes && <span className={s.historyChip}>{fmt(item.params.scene_count)} scenes</span>}
                        </div>
                        <div className={s.historyPreview}>{fmt(item.preview)}</div>
                    </>
                );
            }}
            renderDetailMeta={(cur) => (
                <div>
                    <div className={s.historyDetailMetaPrimary}>
                        <strong>Video</strong>
                        {' · '}{fmt(cur.params?.lang)}
                        {' · '}{fmt(cur.params?.provider)}
                        {cur.params?.has_scenes && ' · Scene-based'}
                    </div>
                    <div className={s.historyDetailMetaTime}>{formatDate(cur.created_at).title}</div>
                </div>
            )}
            renderDetailParams={(cur) => (
                <>
                    <div className={s.historyParamItem}><span>Language</span><strong>{fmt(cur.params?.lang)}</strong></div>
                    <div className={s.historyParamItem}><span>Provider</span><strong>{fmt(cur.params?.provider)}</strong></div>
                    <div className={s.historyParamItem}><span>Subtitles</span><strong>{cur.params?.subtitles ? 'Yes' : 'No'}</strong></div>
                    <div className={s.historyParamItem}><span>Max Segments</span><strong>{fmt(cur.params?.max_segments)}</strong></div>
                    <div className={s.historyParamItem}><span>Audience</span><strong>{fmt(cur.params?.audience)}</strong></div>
                    {cur.params?.has_scenes && <div className={s.historyParamItem}><span>Scene Count</span><strong>{fmt(cur.params?.scene_count)}</strong></div>}
                </>
            )}
            renderDetailContent={(detail) => {
                if (!detail?.result) return <div className={s.historyDetailLoading}>No result data available.</div>;
                try {
                    const parsed = asRecord(JSON.parse(detail.result));
                    if (parsed && typeof parsed.videoPath === 'string') {
                        return (
                            <div style={{ textAlign: 'center', padding: '1rem' }}>
                                <p><strong>Video Path:</strong> {parsed.videoPath}</p>
                                <p style={{ fontSize: '0.85rem', opacity: 0.7 }}>Task ID: {fmt(toStringOrUndefined(parsed.task_id))}</p>
                            </div>
                        );
                    }
                } catch { /* not JSON */ }
                return <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.88rem' }}>{detail.result}</pre>;
            }}
        />
    );
}
