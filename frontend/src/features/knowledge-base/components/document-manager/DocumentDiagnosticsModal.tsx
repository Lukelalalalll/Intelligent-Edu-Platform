import React, { useEffect, useMemo, useState } from 'react';
import BaseModal from '../../../../shared/BaseModal';
import styles from '../../styles/KnowledgeBase.module.css';
import { knowledgeBaseApi } from '../../../../api/knowledgeBaseApi';
import type { DocumentDiagnostics } from '../../../../api/knowledgeBaseApi';

function formatValue(value: unknown): string {
    if (value === null || value === undefined || value === '') return '-';
    if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(4);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    return String(value);
}

function formatDate(value?: string): string {
    if (!value) return '-';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

export default function DocumentDiagnosticsModal({
    courseId,
    docName,
    open,
    onClose,
}: {
    courseId: string;
    docName: string | null;
    open: boolean;
    onClose: () => void;
}) {
    const [diagnostics, setDiagnostics] = useState<DocumentDiagnostics | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!open || !docName) return;

        let active = true;
        setLoading(true);
        setError('');

        (async () => {
            try {
                const data = await knowledgeBaseApi.getDocDiagnostics(courseId, docName);
                if (!active) return;
                setDiagnostics(data);
            } catch (err) {
                if (!active) return;
                const message = err instanceof Error ? err.message : 'Failed to load diagnostics';
                setDiagnostics(null);
                setError(message);
            } finally {
                if (active) setLoading(false);
            }
        })();

        return () => {
            active = false;
        };
    }, [courseId, docName, open]);

    const qualityEntries = useMemo(
        () => Object.entries(diagnostics?.quality_report ?? {}),
        [diagnostics],
    );

    return (
        <BaseModal open={open} onClose={onClose} width={860}>
            <div className={styles.diagnosticsModal}>
                <div className={styles.diagnosticsHeader}>
                    <div>
                        <h3 className={styles.diagnosticsTitle}>Document Diagnostics</h3>
                        <p className={styles.diagnosticsSubtitle}>{docName || 'Unknown document'}</p>
                    </div>
                    <button
                        type="button"
                        className={styles.diagnosticsCloseBtn}
                        onClick={onClose}
                        aria-label="Close diagnostics"
                    >
                        <i className="fas fa-times" />
                    </button>
                </div>

                {loading ? (
                    <div className={styles.diagnosticsState}>Loading diagnostics...</div>
                ) : error ? (
                    <div className={styles.diagnosticsStateError}>{error}</div>
                ) : diagnostics ? (
                    <div className={styles.diagnosticsBody}>
                        <section className={styles.diagnosticsSection}>
                            <h4 className={styles.diagnosticsSectionTitle}>Build Overview</h4>
                            <div className={styles.diagnosticsGrid}>
                                <div>
                                    <span className={styles.diagnosticsLabel}>Parser used</span>
                                    <span className={styles.diagnosticsValue}>{formatValue(diagnostics.parser_used)}</span>
                                </div>
                                <div>
                                    <span className={styles.diagnosticsLabel}>Parser strategy</span>
                                    <span className={styles.diagnosticsValue}>{formatValue(diagnostics.parser_strategy)}</span>
                                </div>
                                <div>
                                    <span className={styles.diagnosticsLabel}>Index version</span>
                                    <span className={styles.diagnosticsValue}>{formatValue(diagnostics.index_version)}</span>
                                </div>
                                <div>
                                    <span className={styles.diagnosticsLabel}>Updated</span>
                                    <span className={styles.diagnosticsValue}>{formatDate(diagnostics.updated_at)}</span>
                                </div>
                                <div>
                                    <span className={styles.diagnosticsLabel}>Job ID</span>
                                    <span className={styles.diagnosticsValue}>{formatValue(diagnostics.job_id)}</span>
                                </div>
                                <div>
                                    <span className={styles.diagnosticsLabel}>Reused from job</span>
                                    <span className={styles.diagnosticsValue}>{formatValue(diagnostics.reused_from_job_id)}</span>
                                </div>
                            </div>
                        </section>

                        <section className={styles.diagnosticsSection}>
                            <h4 className={styles.diagnosticsSectionTitle}>Fallback Chain</h4>
                            {diagnostics.fallback_chain && diagnostics.fallback_chain.length > 0 ? (
                                <div className={styles.diagnosticsChipRow}>
                                    {diagnostics.fallback_chain.map(item => (
                                        <span key={item} className={styles.diagnosticsChip}>{item}</span>
                                    ))}
                                </div>
                            ) : (
                                <p className={styles.diagnosticsEmpty}>No fallback parser was needed.</p>
                            )}
                        </section>

                        <section className={styles.diagnosticsSection}>
                            <h4 className={styles.diagnosticsSectionTitle}>Quality Report</h4>
                            {qualityEntries.length > 0 ? (
                                <div className={styles.diagnosticsGrid}>
                                    {qualityEntries.map(([key, value]) => (
                                        <div key={key}>
                                            <span className={styles.diagnosticsLabel}>{key}</span>
                                            <span className={styles.diagnosticsValue}>{formatValue(value)}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className={styles.diagnosticsEmpty}>No quality report found.</p>
                            )}
                        </section>

                        <section className={styles.diagnosticsSection}>
                            <h4 className={styles.diagnosticsSectionTitle}>Artifacts</h4>
                            {diagnostics.artifact_refs && diagnostics.artifact_refs.length > 0 ? (
                                <div className={styles.diagnosticsArtifactList}>
                                    {diagnostics.artifact_refs.map((artifact, index) => (
                                        <div key={`${artifact.kind}-${index}`} className={styles.diagnosticsArtifactRow}>
                                            <span className={styles.diagnosticsArtifactKind}>{artifact.kind}</span>
                                            <span className={styles.diagnosticsArtifactPath}>{artifact.storage_path || '-'}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className={styles.diagnosticsEmpty}>No artifact references found.</p>
                            )}
                        </section>
                    </div>
                ) : (
                    <div className={styles.diagnosticsState}>No diagnostics available.</div>
                )}
            </div>
        </BaseModal>
    );
}
