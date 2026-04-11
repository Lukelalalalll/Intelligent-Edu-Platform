import React from 'react';
import ReactMarkdown from 'react-markdown';
import HistoryPanel from '../../../shared/components/HistoryPanel/HistoryPanel';
import * as api from '../api/slidesApi';
import s from '../../../styles/history.module.css';

const fmt = (v: any, fb = '-') => {
    if (v == null) return fb;
    if (Array.isArray(v)) { const f = v.filter(x => String(x ?? '').trim()); return f.length ? f.join(', ') : fb; }
    return String(v).trim() || fb;
};

const exportMd = (item: any, content: string) => {
    if (!content?.trim()) return;
    const ts = new Date(item?.created_at || Date.now()).toISOString().replace(/[:.]/g, '-');
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `slides-history-${ts}.md`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
};

const slidesHistoryApi = { getHistory: api.getGenerationHistory, getDetail: api.getGenerationDetail };

export default function SlidesHistoryPanel({ onReplay }: { onReplay?: (item: any) => void }) {
    return (
        <HistoryPanel
            api={slidesHistoryApi}
            title="Generation History"
            subtitle="Recent generation snapshots and quick replay"
            detailTitle="Generation Details"
            onReplay={onReplay}
            renderCard={(item) => (
                <>
                    <div className={s.historyItemTopRow}>
                        <div className={s.historyItemSubject}>{fmt(item.params?.tool, 'Slides')}</div>
                        <div className={s.historyItemDate} title={new Date(item.created_at).toLocaleString()}>{new Date(item.created_at).toLocaleDateString()}</div>
                    </div>
                    <div className={s.historyItemChips}>
                        {item.params?.provider && <span className={s.historyChipPrimary}>{item.params.provider}</span>}
                        {item.params?.keywords && <span className={s.historyChip}>{item.params.keywords}</span>}
                    </div>
                    <div className={s.historyPreview}>{item.preview}</div>
                </>
            )}
            renderDetailMeta={(cur) => (
                <div>
                    <div className={s.historyDetailMetaPrimary}>
                        <strong>{fmt(cur.params?.tool)}</strong>
                        {cur.params?.keywords && <>{' · '}{fmt(cur.params.keywords)}</>}
                        {cur.params?.provider && <>{' · '}{fmt(cur.params.provider)}</>}
                    </div>
                    <div className={s.historyDetailMetaTime}>{new Date(cur.created_at).toLocaleString()}</div>
                </div>
            )}
            renderDetailActions={(cur, detail) => (
                <button className={`${s.btn} ${s.btnSecondary} ${s.historyExportBtn}`}
                    onClick={() => exportMd(cur, String(detail?.result ?? ''))}
                    disabled={!detail?.result}>
                    <i className={`fas fa-file-export ${s.historyIconGap}`} />Export .md
                </button>
            )}
            renderDetailParams={(cur) => (
                <>
                    <div className={s.historyParamItem}><span>Tool</span><strong>{fmt(cur.params?.tool)}</strong></div>
                    <div className={s.historyParamItem}><span>Provider</span><strong>{fmt(cur.params?.provider)}</strong></div>
                    <div className={s.historyParamItem}><span>Keywords</span><strong>{fmt(cur.params?.keywords)}</strong></div>
                    <div className={s.historyParamItem}><span>Sections</span><strong>{fmt(cur.params?.sections_count)}</strong></div>
                </>
            )}
            renderDetailContent={(detail) => (
                <ReactMarkdown>{String(detail?.result ?? '')}</ReactMarkdown>
            )}
        />
    );
}
