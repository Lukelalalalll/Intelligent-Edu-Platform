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

/** Derive a human-readable label from the merged history item's tool / service_type. */
function toolLabel(item: any): string {
    const tool = String(item.tool || item.params?.service_type || '').toLowerCase();
    if (tool === 'extract_diagram' || tool === 'extract') return 'Extract Diagram';
    if (tool === 'generate' || tool === 'ai_generate') return 'AI Generate';
    if (tool === 'extract_pdf_images') return 'Image Extract';
    if (tool === 'ai_image_generate') return 'AI Images';
    return fmt(tool, 'Visual Tool');
}

export default function DiagramHistoryPanel({ onReplay }: { onReplay?: (item: any) => void }) {
    return (
        <HistoryPanel
            api={historyApi}
            title="Generation History"
            subtitle="Recent Visual Tool usage — Extract, Image Extract, and AI Generate"
            detailTitle="Visual Tool Generation Details"
            onReplay={onReplay}
            renderCard={(item) => (
                <>
                    <div className={s.historyItemTopRow}>
                        <div className={s.historyItemSubject}>{toolLabel(item)}</div>
                        <div className={s.historyItemDate} title={new Date(item.created_at).toLocaleString()}>{new Date(item.created_at).toLocaleDateString()}</div>
                    </div>
                    <div className={s.historyItemChips}>
                        <span className={s.historyChipPrimary}>{toolLabel(item)}</span>
                        {item.params?.provider && <span className={s.historyChip}>{item.params.provider}</span>}
                        {item.params?.extracted_count != null && <span className={s.historyChip}>{item.params.extracted_count} diagrams</span>}
                        {item.params?.num_images != null && <span className={s.historyChip}>{item.params.num_images} imgs</span>}
                    </div>
                    <div className={s.historyPreview}>{item.preview}</div>
                </>
            )}
            renderDetailMeta={(cur) => (
                <div>
                    <div className={s.historyDetailMetaPrimary}>
                        <strong>{toolLabel(cur)}</strong>
                        {cur.params?.provider && <>{' · '}{cur.params.provider}</>}
                    </div>
                    <div className={s.historyDetailMetaTime}>{new Date(cur.created_at).toLocaleString()}</div>
                </div>
            )}
            renderDetailParams={(cur) => (
                <>
                    <div className={s.historyParamItem}><span>Type</span><strong>{toolLabel(cur)}</strong></div>
                    {cur.params?.provider && <div className={s.historyParamItem}><span>Provider</span><strong>{fmt(cur.params.provider)}</strong></div>}
                    {cur.params?.draft_quality != null && <div className={s.historyParamItem}><span>Draft Quality</span><strong>{fmt(cur.params.draft_quality)}</strong></div>}
                    {cur.params?.refined != null && <div className={s.historyParamItem}><span>Refined</span><strong>{cur.params.refined ? 'Yes' : 'No'}</strong></div>}
                    {cur.params?.extracted_count != null && <div className={s.historyParamItem}><span>Extracted</span><strong>{cur.params.extracted_count} diagrams</strong></div>}
                    {cur.params?.source_filename && <div className={s.historyParamItem}><span>Source File</span><strong>{fmt(cur.params.source_filename)}</strong></div>}
                    {cur.params?.prompt && <div className={`${s.historyParamItem} ${s.historyParamItemFull}`}><span>Prompt</span><strong>{fmt(cur.params.prompt)}</strong></div>}
                    {cur.params?.input_prompt && <div className={`${s.historyParamItem} ${s.historyParamItemFull}`}><span>Input Prompt</span><strong>{fmt(cur.params.input_prompt)}</strong></div>}
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
