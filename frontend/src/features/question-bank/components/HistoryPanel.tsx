import React from 'react';
import ReactMarkdown from 'react-markdown';
import HistoryPanel from '../../../shared/components/HistoryPanel/HistoryPanel';
import * as sub2Api from '../../../api/questionBankApi';
import styles from '../styles/history.module.css';

const formatValue = (value: any, fallback = '-') => {
    if (value === null || value === undefined) return fallback;
    if (Array.isArray(value)) {
        const filtered = value.filter((v: any) => String(v ?? '').trim() !== '');
        return filtered.length ? filtered.join(', ') : fallback;
    }
    const text = String(value).trim();
    return text || fallback;
};

const exportDetailMarkdown = (item: any, content: string) => {
    const markdown = String(content ?? '').trim();
    if (!markdown) return;
    const safeType = String(item?.params?.question_type || 'questions')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'questions';
    const ts = new Date(item?.created_at || Date.now()).toISOString().replace(/[:.]/g, '-');
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `history-${safeType}-${ts}.md`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); window.URL.revokeObjectURL(url);
};

const questionBankHistoryApi = { getHistory: sub2Api.getGenerationHistory, getDetail: sub2Api.getGenerationDetail };

export default function QuestionBankHistoryPanel({ onReplay }: { onReplay?: (item: any) => void }) {
    return (
        <HistoryPanel
            api={questionBankHistoryApi}
            styles={styles}
            title="Generation History"
            subtitle="Recent generation snapshots and quick replay"
            detailTitle="Generation Details"
            onReplay={onReplay}
            renderCard={(item) => (
                <>
                    <div className={styles.historyItemTopRow}>
                        <div className={styles.historyItemSubject}>{item.params.subject}</div>
                        <div className={styles.historyItemDate} title={new Date(item.created_at).toLocaleString()}>{new Date(item.created_at).toLocaleDateString()}</div>
                    </div>
                    <div className={styles.historyItemChips}>
                        <span className={styles.historyChipPrimary}>{item.params.question_type}</span>
                        <span className={styles.historyChip}>{item.params.num_questions} qs</span>
                        <span className={styles.historyChip}>Lv {item.params.difficulty}</span>
                    </div>
                    <div className={styles.historyPreview}>{item.preview}</div>
                </>
            )}
            renderDetailMeta={(cur) => (
                <div>
                    <div className={styles.historyDetailMetaPrimary}>
                        <strong>{cur.params.subject}</strong>
                        {' · '}{cur.params.question_type}
                        {' · '}{cur.params.num_questions} questions
                        {' · Difficulty '}{cur.params.difficulty}
                    </div>
                    <div className={styles.historyDetailMetaTime}>{new Date(cur.created_at).toLocaleString()}</div>
                </div>
            )}
            renderDetailActions={(cur, detail) => (
                <button className={`${styles.btn} ${styles.btnSecondary} ${styles.historyExportBtn}`}
                    onClick={() => exportDetailMarkdown(cur, String(detail?.result ?? ''))}
                    disabled={!detail?.result}>
                    <i className={`fas fa-file-export ${styles.historyIconGap}`} />Export to .md
                </button>
            )}
            renderDetailParams={(cur) => (
                <>
                    <div className={styles.historyParamItem}><span>Question Type</span><strong>{formatValue(cur.params?.question_type)}</strong></div>
                    <div className={styles.historyParamItem}><span>Question Number</span><strong>{formatValue(cur.params?.num_questions)}</strong></div>
                    <div className={styles.historyParamItem}><span>Difficulty</span><strong>{formatValue(cur.params?.difficulty)}</strong></div>
                    <div className={styles.historyParamItem}><span>Language</span><strong>{formatValue(cur.params?.output_language)}</strong></div>
                    <div className={styles.historyParamItem}><span>Source Type</span><strong>{formatValue(cur.params?.source_type)}</strong></div>
                    <div className={styles.historyParamItem}><span>Page Numbers</span><strong>{formatValue(cur.params?.page_numbers)}</strong></div>
                    <div className={`${styles.historyParamItem} ${styles.historyParamItemFull}`}><span>Constraints</span><strong>{formatValue(cur.params?.constraints)}</strong></div>
                </>
            )}
            renderDetailContent={(detail) => (
                <div className={styles.markdownContainer}>
                    <ReactMarkdown>{String(detail?.result ?? '')}</ReactMarkdown>
                </div>
            )}
        />
    );
}
