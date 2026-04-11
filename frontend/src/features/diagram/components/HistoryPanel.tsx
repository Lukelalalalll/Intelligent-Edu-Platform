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

export default function DiagramHistoryPanel({ onReplay }: { onReplay?: (item: any) => void }) {
    return (
        <HistoryPanel
            api={historyApi}
            title="Generation History"
            subtitle="Recent diagram generations and quick replay"
            detailTitle="Diagram Generation Details"
            onReplay={onReplay}
            renderCard={(item) => (
                <>
                    <div className={s.historyItemTopRow}>
                        <div className={s.historyItemSubject}>{fmt(item.params?.service_type, 'Diagram')}</div>
                        <div className={s.historyItemDate} title={new Date(item.created_at).toLocaleString()}>{new Date(item.created_at).toLocaleDateString()}</div>
                    </div>
                    <div className={s.historyItemChips}>
                        <span className={s.historyChipPrimary}>{fmt(item.params?.service_type)}</span>
                        {item.params?.provider && <span className={s.historyChip}>{item.params.provider}</span>}
                    </div>
                    <div className={s.historyPreview}>{item.preview}</div>
                </>
            )}
            renderDetailMeta={(cur) => (
                <div>
                    <div className={s.historyDetailMetaPrimary}>
                        <strong>{fmt(cur.params?.service_type)}</strong>{' · '}{fmt(cur.params?.provider)}
                    </div>
                    <div className={s.historyDetailMetaTime}>{new Date(cur.created_at).toLocaleString()}</div>
                </div>
            )}
            renderDetailParams={(cur) => (
                <>
                    <div className={s.historyParamItem}><span>Service</span><strong>{fmt(cur.params?.service_type)}</strong></div>
                    <div className={s.historyParamItem}><span>Provider</span><strong>{fmt(cur.params?.provider)}</strong></div>
                    <div className={s.historyParamItem}><span>Draft Quality</span><strong>{fmt(cur.params?.draft_quality)}</strong></div>
                    <div className={s.historyParamItem}><span>Refined</span><strong>{cur.params?.refined ? 'Yes' : 'No'}</strong></div>
                    <div className={`${s.historyParamItem} ${s.historyParamItemFull}`}><span>Input Prompt</span><strong>{fmt(cur.params?.input_prompt)}</strong></div>
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
