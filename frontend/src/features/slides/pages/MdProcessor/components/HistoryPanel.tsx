import React from 'react';
import HistoryPanel from '@/shared/components/HistoryPanel/HistoryPanel';
import * as api from '../../../api/slidesApi';
import {
    renderSlidesHistoryCard,
    renderSlidesHistoryDetailContent,
} from '@/features/slides/history/slidesHistoryPresenter';
import s from '@/styles/history.module.css';

const slidesHistoryApi = { getHistory: api.getGenerationHistory, getDetail: api.getGenerationDetail };

export default function SlidesHistoryPanel({ onReplay }: { onReplay?: (item: any) => void }) {
    const handleDownload = (url: string, filename: string) => {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <HistoryPanel
            api={slidesHistoryApi}
            title="Generation History"
            subtitle="Recent generation snapshots and workflow records"
            detailTitle="Generation Details"
            onReplay={onReplay}
            renderCard={(item) => renderSlidesHistoryCard(item)}
            renderDetailMeta={(cur) => (
                <div>
                    <div className={s.historyDetailMetaPrimary}>
                        <strong>{String(cur.params?.tool || cur.tool || 'Slides')}</strong>
                        {cur.params?.provider && <>{' · '}{String(cur.params.provider)}</>}
                        {cur.params?.base_style && <>{' · '}{String(cur.params.base_style)}</>}
                    </div>
                    <div className={s.historyDetailMetaTime}>{new Date(cur.created_at ?? Date.now()).toLocaleString()}</div>
                </div>
            )}
            renderDetailActions={(cur, detail) => {
                const slidesDetail = (detail as any)?.slides_detail;
                return (
                    <>
                        {slidesDetail?.result_artifacts?.pptx_download_url ? (
                            <button
                                className={`${s.btn} ${s.btnPrimary} ${s.historyExportBtn}`}
                                onClick={() => handleDownload(slidesDetail.result_artifacts.pptx_download_url, slidesDetail.result_artifacts.pptx_filename || 'presentation.pptx')}
                            >
                                <i className="fas fa-file-powerpoint" /> Download PPTX
                            </button>
                        ) : null}
                        {slidesDetail?.source_artifacts?.source_download_url ? (
                            <button
                                className={`${s.btn} ${s.btnSecondary} ${s.historyExportBtn}`}
                                onClick={() => handleDownload(slidesDetail.source_artifacts.source_download_url, slidesDetail.source_artifacts.source_display_name || slidesDetail.source_artifacts.source_filename || 'source')}
                            >
                                <i className="fas fa-download" /> Download Source
                            </button>
                        ) : null}
                    </>
                );
            }}
            renderDetailParams={(cur) => (
                <>
                    <div className={s.historyParamItem}><span>Tool</span><strong>{String(cur.params?.tool || cur.tool || 'Slides')}</strong></div>
                    <div className={s.historyParamItem}><span>Provider</span><strong>{String(cur.params?.provider || '-')}</strong></div>
                    <div className={s.historyParamItem}><span>Base Style</span><strong>{String(cur.params?.base_style || '-')}</strong></div>
                    <div className={s.historyParamItem}><span>Page Count</span><strong>{String((cur as any)?.slides_detail?.result_artifacts?.page_count ?? cur.params?.page_count ?? '-')}</strong></div>
                </>
            )}
            renderDetailContent={(detail) => renderSlidesHistoryDetailContent(detail as any, handleDownload)}
        />
    );
}

