import React from 'react';
import HistoryPanel from '../../../shared/components/HistoryPanel/HistoryPanel';
import * as api from '../api/historyApi';
import s from '../../../styles/history.module.css';

const fmt = (v: any, fb = '-') => {
    if (v == null) return fb;
    if (Array.isArray(v)) { const f = v.filter(x => String(x ?? '').trim()); return f.length ? f.join(', ') : fb; }
    return String(v).trim() || fb;
};

const historyApi = { getHistory: api.getGenerationHistory, getDetail: api.getGenerationDetail };

export default function ImageHistoryPanel({ onReplay }: { onReplay?: (item: any) => void }) {
    return (
        <HistoryPanel
            api={historyApi}
            title="Extraction History"
            subtitle="Recent image extraction and generation snapshots"
            detailTitle="Extraction Details"
            onReplay={onReplay}
            renderCard={(item) => (
                <>
                    <div className={s.historyItemTopRow}>
                        <div className={s.historyItemSubject}>{fmt(item.tool, 'Image Extractor')}</div>
                        <div className={s.historyItemDate} title={new Date(item.created_at).toLocaleString()}>{new Date(item.created_at).toLocaleDateString()}</div>
                    </div>
                    <div className={s.historyItemChips}>
                        <span className={s.historyChipPrimary}>{fmt(item.tool)}</span>
                        {item.params?.num_images && <span className={s.historyChip}>{item.params.num_images} images</span>}
                    </div>
                    <div className={s.historyPreview}>{item.preview}</div>
                </>
            )}
            renderDetailMeta={(cur) => (
                <div>
                    <div className={s.historyDetailMetaPrimary}>
                        <strong>{fmt(cur.tool)}</strong>
                        {cur.params?.prompt && <>{' · '}{cur.params.prompt.slice(0, 60)}</>}
                    </div>
                    <div className={s.historyDetailMetaTime}>{new Date(cur.created_at).toLocaleString()}</div>
                </div>
            )}
            renderDetailParams={(cur) => (
                <>
                    <div className={s.historyParamItem}><span>Tool</span><strong>{fmt(cur.tool)}</strong></div>
                    <div className={s.historyParamItem}><span>Num Images</span><strong>{fmt(cur.params?.num_images)}</strong></div>
                    <div className={`${s.historyParamItem} ${s.historyParamItemFull}`}><span>Prompt</span><strong>{fmt(cur.params?.prompt)}</strong></div>
                    {cur.params?.source_filename && <div className={s.historyParamItem}><span>Source</span><strong>{fmt(cur.params.source_filename)}</strong></div>}
                </>
            )}
            renderDetailContent={(detail) =>
                detail?.result
                    ? <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.88rem' }}>{detail.result}</pre>
                    : <div className={s.historyDetailLoading}>No result data available.</div>
            }
        />
    );
}
