import React from 'react';
import HistoryPanel from '../../../shared/components/HistoryPanel/HistoryPanel';
import * as api from '../api/videoApi';
import s from '../../../styles/history.module.css';

const fmt = (v: any, fb = '-') => (v == null ? fb : String(v).trim() || fb);

const historyApi = { getHistory: api.getGenerationHistory, getDetail: api.getGenerationDetail };

export default function VideoHistoryPanel() {
    return (
        <HistoryPanel
            api={historyApi}
            title="Video History"
            subtitle="Recent video generation records"
            detailTitle="Video Generation Details"
            renderCard={(item) => (
                <>
                    <div className={s.historyItemTopRow}>
                        <div className={s.historyItemSubject}>Video Generation</div>
                        <div className={s.historyItemDate} title={new Date(item.created_at).toLocaleString()}>{new Date(item.created_at).toLocaleDateString()}</div>
                    </div>
                    <div className={s.historyItemChips}>
                        <span className={s.historyChipPrimary}>{fmt(item.params?.lang, 'zh')}</span>
                        <span className={s.historyChip}>{fmt(item.params?.provider)}</span>
                        {item.params?.has_scenes && <span className={s.historyChip}>{item.params.scene_count} scenes</span>}
                    </div>
                    <div className={s.historyPreview}>{item.preview}</div>
                </>
            )}
            renderDetailMeta={(cur) => (
                <div>
                    <div className={s.historyDetailMetaPrimary}>
                        <strong>Video</strong>
                        {' · '}{fmt(cur.params?.lang)}
                        {' · '}{fmt(cur.params?.provider)}
                        {cur.params?.has_scenes && ' · Scene-based'}
                    </div>
                    <div className={s.historyDetailMetaTime}>{new Date(cur.created_at).toLocaleString()}</div>
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
                    const parsed = JSON.parse(detail.result);
                    if (parsed.videoPath) {
                        return (
                            <div style={{ textAlign: 'center', padding: '1rem' }}>
                                <p><strong>Video Path:</strong> {parsed.videoPath}</p>
                                <p style={{ fontSize: '0.85rem', opacity: 0.7 }}>Task ID: {parsed.task_id}</p>
                            </div>
                        );
                    }
                } catch { /* not JSON */ }
                return <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.88rem' }}>{detail.result}</pre>;
            }}
        />
    );
}
