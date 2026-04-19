import React, { useCallback, useEffect, useState } from 'react';
import styles from '../styles/RagEvaluator.module.css';
import * as api from '../api/ragEvaluatorApi';
import type { RagCourse, RagDoc, EvalMode } from '../api/ragEvaluatorApi';

export interface EvalConfig {
    courseId: string;
    selectedDocs: string[];
    mode: EvalMode;
    topK: number;
}

interface Props {
    config: EvalConfig;
    onChange: (config: EvalConfig) => void;
}

export default function StepConfig({ config, onChange }: Props) {
    const [courses, setCourses] = useState<RagCourse[]>([]);
    const [docs, setDocs] = useState<RagDoc[]>([]);
    const [loadingCourses, setLoadingCourses] = useState(false);
    const [loadingDocs, setLoadingDocs] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);

    const fetchCourses = useCallback(async () => {
        setLoadingCourses(true);
        try {
            setCourses(await api.listCourses());
        } catch (e) {
            console.error('Failed to load courses', e);
        } finally {
            setLoadingCourses(false);
        }
    }, []);

    useEffect(() => {
        fetchCourses();
    }, [fetchCourses]);

    useEffect(() => {
        if (!config.courseId) {
            setDocs([]);
            return;
        }
        let alive = true;
        setLoadingDocs(true);
        api.listDocs(config.courseId)
            .then(d => { if (alive) setDocs(d); })
            .catch(console.error)
            .finally(() => { if (alive) setLoadingDocs(false); });
        return () => { alive = false; };
    }, [config.courseId]);

    const handleCourseChange = (courseId: string) => {
        onChange({ ...config, courseId, selectedDocs: [] });
    };

    const handleDocToggle = (docName: string) => {
        const sel = config.selectedDocs.includes(docName)
            ? config.selectedDocs.filter(d => d !== docName)
            : [...config.selectedDocs, docName];
        onChange({ ...config, selectedDocs: sel });
    };

    const handleSelectAllDocs = () => {
        if (config.selectedDocs.length === docs.length) {
            onChange({ ...config, selectedDocs: [] });
        } else {
            onChange({ ...config, selectedDocs: docs.map(d => d.doc_name) });
        }
    };

    return (
        <div>
            {/* Course selector */}
            <div className={styles.card}>
                <h4 className={styles.cardTitle}>
                    <i className="fas fa-book" style={{ marginRight: 8 }} />
                    Course
                </h4>
                <div className={styles.formRow}>
                    <select
                        className={styles.formSelect}
                        value={config.courseId}
                        onChange={e => handleCourseChange(e.target.value)}
                        disabled={loadingCourses}
                    >
                        <option value="">{loadingCourses ? 'Loading...' : 'Select a course...'}</option>
                        {courses.map(c => (
                            <option key={c.course_id} value={c.course_id}>
                                {c.name || c.course_id} ({c.doc_count} docs)
                            </option>
                        ))}
                    </select>
                </div>

                {/* Document selector */}
                {config.courseId && (
                    <>
                        <h4 className={styles.cardTitle} style={{ marginTop: 16 }}>
                            <i className="fas fa-file-alt" style={{ marginRight: 8 }} />
                            Documents
                            {docs.length > 0 && (
                                <span className={`${styles.badge} ${styles.badgeCount}`} style={{ marginLeft: 8 }}>
                                    {config.selectedDocs.length}/{docs.length}
                                </span>
                            )}
                        </h4>
                        {loadingDocs ? (
                            <p className={styles.loadingText}>Loading documents...</p>
                        ) : docs.length === 0 ? (
                            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No indexed documents found</p>
                        ) : (
                            <>
                                <label className={styles.toggleLabel} style={{ marginBottom: 8 }}>
                                    <input
                                        type="checkbox"
                                        checked={config.selectedDocs.length === docs.length}
                                        onChange={handleSelectAllDocs}
                                    />
                                    Select all
                                </label>
                                <div className={styles.checkboxList}>
                                    {docs.map(d => (
                                        <label key={d.doc_name} className={styles.checkboxItem}>
                                            <input
                                                type="checkbox"
                                                checked={config.selectedDocs.includes(d.doc_name)}
                                                onChange={() => handleDocToggle(d.doc_name)}
                                            />
                                            {d.doc_name}
                                            <span className={`${styles.badge} ${styles.badgeCount}`}>{d.chunk_count}</span>
                                        </label>
                                    ))}
                                </div>
                            </>
                        )}
                    </>
                )}
            </div>

            {/* Algorithm selection */}
            <div className={styles.card}>
                <h4 className={styles.cardTitle}>
                    <i className="fas fa-cogs" style={{ marginRight: 8 }} />
                    Algorithm
                </h4>
                <div className={styles.algoPills}>
                    {([
                        { key: 'comparison' as EvalMode, label: 'A/B Comparison', desc: 'Compare Hybrid vs Vector' },
                        { key: 'hybrid' as EvalMode, label: 'Hybrid (BM25 + Vector)', desc: '' },
                        { key: 'vector' as EvalMode, label: 'Vector-Only', desc: '' },
                    ]).map(opt => (
                        <button
                            key={opt.key}
                            className={`${styles.algoPill} ${config.mode === opt.key ? styles.algoPillActive : ''}`}
                            onClick={() => onChange({ ...config, mode: opt.key })}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Parameters */}
            <div className={styles.card}>
                <h4 className={styles.cardTitle}>
                    <i className="fas fa-sliders-h" style={{ marginRight: 8 }} />
                    Parameters
                </h4>

                <div className={styles.formRow} style={{ alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 120 }}>
                        <span className={styles.formLabel}>Top K</span>
                        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-sub, #637381)', lineHeight: 1.5 }}>
                            Number of document chunks retrieved per query. Both strategies share the same budget — only the ranking method differs.
                        </p>
                        <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-sub, #94a3b8)', fontStyle: 'italic' }}>
                            Recommended: 4 – 5
                        </p>
                    </div>
                    <div className={styles.sliderRow}>
                        <input
                            type="range"
                            className={styles.slider}
                            min={1}
                            max={20}
                            value={config.topK}
                            onChange={e => onChange({ ...config, topK: +e.target.value })}
                        />
                        <span className={styles.sliderValue}>{config.topK}</span>
                        <input
                            type="number"
                            className={styles.formInput}
                            style={{ width: 60 }}
                            min={1}
                            max={20}
                            value={config.topK}
                            onChange={e => onChange({ ...config, topK: Math.max(1, Math.min(20, +e.target.value || 4)) })}
                        />
                    </div>
                </div>

                {(config.mode === 'hybrid' || config.mode === 'comparison') && (
                    <button
                        className={styles.advancedToggle}
                        onClick={() => setShowAdvanced(!showAdvanced)}
                    >
                        <i className={`fas fa-chevron-${showAdvanced ? 'up' : 'down'}`} style={{ marginRight: 4 }} />
                        Advanced Settings
                    </button>
                )}

                {showAdvanced && (config.mode === 'hybrid' || config.mode === 'comparison') && (
                    <div className={styles.advancedPanel}>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 4px' }}>
                            BM25 and RRF parameters use system defaults (BM25 k1=1.5, b=0.75; RRF k=60).
                            These are configured at the service level.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
