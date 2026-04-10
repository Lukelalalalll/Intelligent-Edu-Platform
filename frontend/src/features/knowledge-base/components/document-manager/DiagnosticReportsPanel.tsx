import React from 'react';
import styles from '../../styles/KnowledgeBase.module.css';
import type { DiagnosticReport } from '../../../../api/diagnosticApi';

interface DiagnosticReportsPanelProps {
    reports: DiagnosticReport[];
    reportCommentMap: Record<string, string>;
    onChangeComment: (reportId: string, value: string) => void;
    onSaveComment: (reportId: string, value: string) => void;
}

export default function DiagnosticReportsPanel({
    reports,
    reportCommentMap,
    onChangeComment,
    onSaveComment,
}: DiagnosticReportsPanelProps) {
    return (
        <div className={`${styles['doc-list-section']} ${styles.reportsSection}`}>
            <h4 className={styles['doc-list-title']}>
                <i className="fas fa-chart-line"></i> Diagnostic Reports
            </h4>

            {reports.length === 0 ? (
                <p className={styles['empty-hint']}>No diagnostic reports yet.</p>
            ) : (
                <div className={styles.reportList}>
                    {reports.map(r => (
                        <div key={r.report_id} className={styles.reportItem}>
                            <div className={styles.reportTitle}>
                                Score {r.overall_score}% ({r.level})
                            </div>
                            <div className={styles.reportMeta}>
                                Chapter: {r.chapter_id} | Session: {r.session_id}
                            </div>
                            <textarea
                                rows={2}
                                value={reportCommentMap[r.report_id] ?? (r.teacher_comment || '')}
                                onChange={(e) => onChangeComment(r.report_id, e.target.value)}
                                placeholder="Teacher comment"
                                className={styles.reportCommentInput}
                            />
                            <button
                                onClick={() => onSaveComment(r.report_id, reportCommentMap[r.report_id] ?? (r.teacher_comment || ''))}
                                className={styles.reportSaveBtn}
                            >
                                Save Comment
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
