import React from 'react';
import type { GenerationHistoryItem } from '@/types/api';
import type { HistoryDetail as FileCenterHistoryDetail, HistoryItem as FileCenterHistoryItem } from '@/features/file-center/api/fileCenterHistoryApi';
import s from '@/styles/history.module.css';

type LooseRecord = Record<string, unknown>;

export type SlidesHistoryWorkflowStep = {
    step: string;
    status: string;
    latency_ms?: number;
    started_at?: string;
    ended_at?: string;
    error?: string;
    metadata?: LooseRecord;
};

export type SlidesHistoryWorkflow = {
    request_id?: string;
    task_type?: string;
    status?: string;
    total_latency_ms?: number;
    created_at?: string;
    steps?: SlidesHistoryWorkflowStep[];
};

export type SlidesHistorySourceArtifacts = {
    kind?: string;
    source_filename?: string;
    source_display_name?: string;
    source_download_url?: string;
    combined_markdown_filename?: string;
    combined_markdown_download_url?: string;
};

export type SlidesHistoryResultArtifacts = {
    request_id?: string;
    title?: string;
    page_count?: number;
    pptx_filename?: string;
    pptx_download_url?: string;
    html_preview_filename?: string;
    html_preview_url?: string;
};

export type SlidesHistoryDetail = GenerationHistoryItem & {
    source?: LooseRecord;
    slides_detail?: {
        request_id?: string;
        workflow?: SlidesHistoryWorkflow | null;
        source_artifacts?: SlidesHistorySourceArtifacts;
        result_artifacts?: SlidesHistoryResultArtifacts;
        result_data?: unknown;
    };
};

export type SlidesHistoryListItem = GenerationHistoryItem & {
    source?: LooseRecord;
};

export function isSlidesHistoryDetail(detail: unknown): detail is SlidesHistoryDetail {
    return typeof detail === 'object' && detail !== null;
}

function asRecord(value: unknown): LooseRecord | null {
    return typeof value === 'object' && value !== null ? (value as LooseRecord) : null;
}

function asString(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown): number | undefined {
    return typeof value === 'number' ? value : undefined;
}

function fmt(v: unknown, fb = '-') {
    if (v == null) return fb;
    if (Array.isArray(v)) {
        const vals = v.map((item) => String(item ?? '').trim()).filter(Boolean);
        return vals.length ? vals.join(', ') : fb;
    }
    const text = String(v).trim();
    return text || fb;
}

function formatDateTime(value?: string): string {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatDateShort(value?: string): string {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function formatDuration(ms?: number): string {
    if (typeof ms !== 'number' || Number.isNaN(ms)) return '-';
    if (ms < 1000) return `${Math.round(ms)} ms`;
    return `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)} s`;
}

export function getSlidesHistorySummary(item: SlidesHistoryListItem): {
    subject: string;
    chips: string[];
    preview: string;
} {
    const params = asRecord(item.params) || {};
    const source = asRecord(item.source) || {};
    const tool = asString(params.tool, asString(item.tool, 'Slides'));
    const provider = asString(params.provider);
    const baseStyle = asString(params.base_style);
    const displayName = asString(source.source_display_name || source.title || source.keywords);
    const pageCount = asNumber(asRecord(source.result_artifacts)?.page_count);
    const chips = [provider, baseStyle, displayName, pageCount != null ? `${pageCount} slides` : ''].filter(Boolean);
    return {
        subject: tool.replace(/_/g, ' '),
        chips,
        preview: asString(item.preview, 'No preview available.'),
    };
}

export function parseSlidesHistoryDetail(detail: SlidesHistoryDetail | FileCenterHistoryDetail): {
    workflow: SlidesHistoryWorkflow | null;
    sourceArtifacts: SlidesHistorySourceArtifacts;
    resultArtifacts: SlidesHistoryResultArtifacts;
    resultData: unknown;
    rawResultText: string;
} {
    const detailRecord = asRecord(detail) || {};
    const detailParams = asRecord(detailRecord.params) || {};
    const slidesDetail = asRecord(detailRecord.slides_detail) || {};
    const sourceArtifacts = (asRecord(slidesDetail.source_artifacts) || {}) as SlidesHistorySourceArtifacts;
    const resultArtifacts = (asRecord(slidesDetail.result_artifacts) || {}) as SlidesHistoryResultArtifacts;
    const workflow = (asRecord(slidesDetail.workflow) || null) as SlidesHistoryWorkflow | null;
    const rawResult = detailRecord.result;
    const rawResultText = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult ?? '', null, 2);
    const resultData = Object.prototype.hasOwnProperty.call(slidesDetail, 'result_data')
        ? slidesDetail.result_data
        : rawResult;
    return { workflow, sourceArtifacts, resultArtifacts, resultData, rawResultText };
}

function renderMetaRecord(entries: Array<[string, unknown]>) {
    return (
        <>
            {entries.map(([label, value]) => (
                <div key={label} className={s.historyParamItem}>
                    <span>{label}</span>
                    <strong>{fmt(value)}</strong>
                </div>
            ))}
        </>
    );
}

export function renderSlidesHistoryDetailContent(
    detail: SlidesHistoryDetail | FileCenterHistoryDetail | null,
    onDownload: (url: string, filename: string) => void,
) {
    if (!detail) {
        return <div className={s.historyDetailLoading}>No result data available.</div>;
    }

    const { workflow, sourceArtifacts, resultArtifacts, resultData, rawResultText } = parseSlidesHistoryDetail(detail);
    const detailRecord = asRecord(detail) || {};
    const detailParams = asRecord(detailRecord.params) || {};
    const resultRecord = asRecord(resultData);
    const workflowSteps = Array.isArray(workflow?.steps) ? workflow?.steps : [];
    const fallbackResultText = typeof resultData === 'string'
        ? resultData
        : (!resultRecord ? rawResultText : JSON.stringify(resultData, null, 2));

    return (
        <div className={s.slidesHistoryDetailContent}>
            <section className={s.slidesHistorySection}>
                <div className={s.slidesHistorySectionHeader}>
                    <h5 className={s.slidesHistorySectionTitle}>Workflow Record</h5>
                    {workflow?.status ? <span className={s.slidesHistoryStatus}>{workflow.status}</span> : null}
                </div>
                {workflow ? (
                    <>
                        <div className={s.slidesHistorySummaryGrid}>
                            {renderMetaRecord([
                                ['Request ID', workflow.request_id],
                                ['Task Type', workflow.task_type],
                                ['Created', formatDateTime(workflow.created_at)],
                                ['Total Time', formatDuration(workflow.total_latency_ms)],
                            ])}
                        </div>
                        {workflowSteps.length ? (
                            <div className={s.slidesHistoryTimeline}>
                                {workflowSteps.map((step, index) => (
                                    <div key={`${step.step}-${index}`} className={s.slidesHistoryTimelineItem}>
                                        <div className={s.slidesHistoryTimelineHeader}>
                                            <strong>{fmt(step.step)}</strong>
                                            <span className={s.slidesHistoryTimelineStatus}>{fmt(step.status)}</span>
                                        </div>
                                        <div className={s.slidesHistoryTimelineMeta}>
                                            <span>{formatDuration(step.latency_ms)}</span>
                                            <span>{formatDateTime(step.started_at)}</span>
                                            <span>{formatDateTime(step.ended_at)}</span>
                                        </div>
                                        {step.metadata && Object.keys(step.metadata).length ? (
                                            <div className={s.slidesHistoryTimelineBody}>
                                                {Object.entries(step.metadata).map(([key, value]) => (
                                                    <span key={key} className={s.slidesHistoryTimelineChip}>
                                                        {key}: {fmt(value)}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : null}
                                        {step.error ? <div className={s.slidesHistoryTimelineError}>{step.error}</div> : null}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className={s.historyDetailLoading}>No workflow steps recorded.</div>
                        )}
                    </>
                ) : (
                    <div className={s.historyDetailLoading}>Workflow metadata is unavailable for this record.</div>
                )}
            </section>

            <section className={s.slidesHistorySection}>
                <div className={s.slidesHistorySectionHeader}>
                    <h5 className={s.slidesHistorySectionTitle}>Result</h5>
                    {resultArtifacts.page_count != null ? (
                        <span className={s.slidesHistoryStatus}>{resultArtifacts.page_count} slides</span>
                    ) : null}
                </div>
                <div className={s.slidesHistorySummaryGrid}>
                    {renderMetaRecord([
                        ['Title', resultArtifacts.title || resultRecord?.title],
                        ['Provider', resultRecord?.provider_resolved || resultRecord?.provider_requested || detailParams.provider],
                        ['Theme', detailParams.base_style],
                        ['Page Count', resultArtifacts.page_count],
                        ['PPTX', resultArtifacts.pptx_filename],
                        ['HTML Preview', resultArtifacts.html_preview_filename],
                    ])}
                </div>
                <div className={s.slidesHistoryButtonRow}>
                    {resultArtifacts.pptx_download_url ? (
                        <button
                            type="button"
                            className={`${s.btn} ${s.btnPrimary}`}
                            onClick={() => onDownload(resultArtifacts.pptx_download_url || '', resultArtifacts.pptx_filename || 'presentation.pptx')}
                        >
                            <i className="fas fa-file-powerpoint" /> Download PPTX
                        </button>
                    ) : null}
                    {resultArtifacts.html_preview_url ? (
                        <button
                            type="button"
                            className={`${s.btn} ${s.btnSecondary}`}
                            onClick={() => onDownload(resultArtifacts.html_preview_url || '', resultArtifacts.html_preview_filename || 'preview.html')}
                        >
                            <i className="fas fa-file-code" /> Download HTML
                        </button>
                    ) : null}
                </div>
                {!resultArtifacts.pptx_download_url && !resultArtifacts.html_preview_url ? (
                    <pre className={s.slidesHistoryRawResult}>{fallbackResultText}</pre>
                ) : null}
            </section>

            <section className={s.slidesHistorySection}>
                <div className={s.slidesHistorySectionHeader}>
                    <h5 className={s.slidesHistorySectionTitle}>Initial File</h5>
                    {sourceArtifacts.kind ? <span className={s.slidesHistoryStatus}>{sourceArtifacts.kind}</span> : null}
                </div>
                <div className={s.slidesHistorySummaryGrid}>
                    {renderMetaRecord([
                        ['Source File', sourceArtifacts.source_display_name || sourceArtifacts.source_filename],
                        ['Stored Key', sourceArtifacts.source_filename],
                        ['Combined Markdown', sourceArtifacts.combined_markdown_filename],
                    ])}
                </div>
                <div className={s.slidesHistoryButtonRow}>
                    {sourceArtifacts.source_download_url ? (
                        <button
                            type="button"
                            className={`${s.btn} ${s.btnPrimary}`}
                            onClick={() => onDownload(sourceArtifacts.source_download_url || '', sourceArtifacts.source_display_name || sourceArtifacts.source_filename || 'source')}
                        >
                            <i className="fas fa-download" /> Download Initial File
                        </button>
                    ) : null}
                    {sourceArtifacts.combined_markdown_download_url ? (
                        <button
                            type="button"
                            className={`${s.btn} ${s.btnSecondary}`}
                            onClick={() => onDownload(sourceArtifacts.combined_markdown_download_url || '', sourceArtifacts.combined_markdown_filename || 'combined.md')}
                        >
                            <i className="fas fa-file-alt" /> Download Markdown
                        </button>
                    ) : null}
                </div>
                {!sourceArtifacts.source_download_url && !sourceArtifacts.combined_markdown_download_url ? (
                    <div className={s.historyDetailLoading}>Source artifact metadata is unavailable for this record.</div>
                ) : null}
            </section>
        </div>
    );
}

export function renderSlidesHistoryCard(item: SlidesHistoryListItem) {
    const summary = getSlidesHistorySummary(item);
    return (
        <>
            <div className={s.historyItemTopRow}>
                <div className={s.historyItemSubject}>{summary.subject}</div>
                <div className={s.historyItemDate} title={formatDateTime(item.created_at)}>{formatDateShort(item.created_at)}</div>
            </div>
            <div className={s.historyItemChips}>
                {summary.chips.length
                    ? summary.chips.map((chip, index) => (
                        <span key={`${chip}-${index}`} className={index === 0 ? s.historyChipPrimary : s.historyChip}>{chip}</span>
                    ))
                    : <span className={s.historyChip}>Slides</span>}
            </div>
            <div className={s.historyPreview}>{summary.preview}</div>
        </>
    );
}
