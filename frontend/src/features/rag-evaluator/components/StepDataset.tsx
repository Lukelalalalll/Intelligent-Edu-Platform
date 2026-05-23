import React, { useCallback, useRef, useState } from 'react';
import styles from '../styles/RagEvaluator.module.css';
import * as api from '../api/ragEvaluatorApi';
import type { TestCase } from '../api/ragEvaluatorApi';
import type { AIProvider } from '../../../shared/aiProvider';
import { getStoredAIProvider, setStoredAIProvider } from '../../../shared/aiProvider';

interface Props {
    courseId: string;
    selectedDocs: string[];
    dataset: TestCase[];
    onChange: (dataset: TestCase[]) => void;
}

function mergeCasesDedup(existing: TestCase[], incoming: TestCase[]): TestCase[] {
    const map = new Map<string, TestCase>();
    const buildKey = (item: TestCase) => `${item.query.trim().toLowerCase()}||${(item.course_ids || []).join(',').toLowerCase()}`;

    for (const item of existing) {
        map.set(buildKey(item), item);
    }
    for (const item of incoming) {
        map.set(buildKey(item), item);
    }
    return Array.from(map.values());
}

export default function StepDataset({ courseId, selectedDocs, dataset, onChange }: Props) {
    const [tab, setTab] = useState<'generate' | 'upload'>('generate');
    const [topicHint, setTopicHint] = useState('');
    const [nQuestions, setNQuestions] = useState(10);
    const [provider, setProvider] = useState<AIProvider>(getStoredAIProvider);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState('');

    const handleProviderChange = useCallback((p: AIProvider) => {
        setProvider(p);
        setStoredAIProvider(p);
    }, []);
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleGenerate = useCallback(async () => {
        if (!courseId) {
            setError('Please select a course in Step 1 first');
            return;
        }
        setGenerating(true);
        setError('');
        try {
            const questions = await api.generateQuestions(courseId, selectedDocs, nQuestions, topicHint, provider);
            const newCases: TestCase[] = questions.map(q => ({
                id: q.id,
                query: q.query,
                course_ids: q.course_ids,
                expected_doc_names: q.expected_doc_names,
                expected_keywords: q.expected_keywords,
            }));
            onChange(mergeCasesDedup(dataset, newCases));
        } catch (e: unknown) {
            const message = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            setError(message || 'Generation failed');
        } finally {
            setGenerating(false);
        }
    }, [courseId, selectedDocs, nQuestions, topicHint, provider, dataset, onChange]);

    const handleFileUpload = useCallback((file: File) => {
        setError('');
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target?.result as string;
                const lines = text.split('\n').filter(l => l.trim());
                const parsed: TestCase[] = [];
                for (let i = 0; i < lines.length; i++) {
                    const obj = JSON.parse(lines[i]);
                    parsed.push({
                        id: obj.id || `upload_${i + 1}`,
                        query: obj.query || '',
                        course_ids: obj.course_ids || (courseId ? [courseId] : []),
                        expected_doc_names: obj.expected_doc_names || [],
                        expected_keywords: obj.expected_keywords || [],
                    });
                }
                if (parsed.length === 0) {
                    setError('No valid JSONL entries found');
                    return;
                }
                onChange(mergeCasesDedup(dataset, parsed));
            } catch (err) {
                setError(`Failed to parse JSONL: ${err instanceof Error ? err.message : 'unknown error'}`);
            }
        };
        reader.readAsText(file);
    }, [courseId, dataset, onChange]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFileUpload(file);
    }, [handleFileUpload]);

    const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFileUpload(file);
        e.target.value = '';
    }, [handleFileUpload]);

    const updateCase = (index: number, field: keyof TestCase, value: string) => {
        const updated = [...dataset];
        const item = { ...updated[index] };
        if (field === 'expected_doc_names' || field === 'expected_keywords' || field === 'course_ids') {
            item[field] = value.split(',').map(s => s.trim()).filter(Boolean);
        } else {
            (item as Record<string, unknown>)[field] = value;
        }
        updated[index] = item;
        onChange(updated);
    };

    const removeCase = (index: number) => {
        onChange(dataset.filter((_, i) => i !== index));
    };

    const addEmptyCase = () => {
        onChange([...dataset, {
            id: `manual_${dataset.length + 1}`,
            query: '',
            course_ids: courseId ? [courseId] : [],
            expected_doc_names: [],
            expected_keywords: [],
        }]);
    };

    return (
        <div>
            {/* Tabs */}
            <div className={styles.tabBar}>
                <button
                    className={`${styles.tabBtn} ${tab === 'generate' ? styles.tabBtnActive : ''}`}
                    onClick={() => setTab('generate')}
                >
                    <i className="fas fa-robot" style={{ marginRight: 6 }} />
                    AI Generate
                </button>
                <button
                    className={`${styles.tabBtn} ${tab === 'upload' ? styles.tabBtnActive : ''}`}
                    onClick={() => setTab('upload')}
                >
                    <i className="fas fa-upload" style={{ marginRight: 6 }} />
                    Upload JSONL
                </button>
            </div>

            {/* AI Generate tab */}
            {tab === 'generate' && (
                <div className={styles.card}>
                    <div className={styles.generateRow}>
                        <input
                            className={styles.generateInput}
                            placeholder="Describe the question types or topics to focus on (optional)..."
                            value={topicHint}
                            onChange={e => setTopicHint(e.target.value)}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Provider:</span>
                            <select
                                className={styles.generateCount}
                                style={{ width: 120 }}
                                value={provider}
                                onChange={e => handleProviderChange(e.target.value as AIProvider)}
                            >
                                <option value="local_ollama">Llama (Local)</option>
                        <option value="deepseek">DeepSeek</option>
                                <option value="coze">Coze</option>
                            </select>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Count:</span>
                            <select
                                className={styles.generateCount}
                                value={nQuestions}
                                onChange={e => setNQuestions(+e.target.value)}
                            >
                                {[5, 10, 15, 20, 30].map(n => (
                                    <option key={n} value={n}>{n}</option>
                                ))}
                            </select>
                        </div>
                        <button
                            className={styles.btnPrimary}
                            onClick={handleGenerate}
                            disabled={generating || !courseId}
                        >
                            {generating ? (
                                <>
                                    <i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }} />
                                    Generating...
                                </>
                            ) : (
                                <>
                                    <i className="fas fa-magic" style={{ marginRight: 6 }} />
                                    Generate
                                </>
                            )}
                        </button>
                    </div>
                    {!courseId && (
                        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            Select a course in Step 1 first
                        </p>
                    )}
                </div>
            )}

            {/* Upload JSONL tab */}
            {tab === 'upload' && (
                <div
                    className={`${styles.dropZone} ${dragOver ? styles.dropZoneDragOver : ''}`}
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <i className="fas fa-cloud-upload-alt" style={{ fontSize: 32, marginBottom: 8, display: 'block' }} />
                    <p>Drag & drop a JSONL file here, or click to browse</p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        Format: one JSON object per line with query, expected_doc_names, expected_keywords
                    </p>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".jsonl,.json,.txt"
                        style={{ display: 'none' }}
                        onChange={handleFileInput}
                    />
                </div>
            )}

            {error && <p className={styles.errorText}>{error}</p>}

            {/* Dataset table */}
            <div style={{ marginTop: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <h4 className={styles.cardTitle} style={{ margin: 0 }}>
                        Test Cases
                        <span className={`${styles.badge} ${styles.badgeCount}`} style={{ marginLeft: 8 }}>
                            {dataset.length}
                        </span>
                    </h4>
                    {dataset.length > 0 && (
                        <button
                            className={styles.btnSecondary}
                            onClick={() => onChange([])}
                            style={{ fontSize: 12, padding: '4px 12px' }}
                        >
                            Clear All
                        </button>
                    )}
                </div>

                {dataset.length === 0 ? (
                    <div className={styles.datasetEmpty}>
                        <i className="fas fa-flask" style={{ fontSize: 24, marginBottom: 8, display: 'block', opacity: 0.4 }} />
                        No test cases yet. Use AI Generate or upload a JSONL file.
                    </div>
                ) : (
                    <div className={styles.tableWrapper}>
                        <table className={styles.dataTable}>
                            <thead>
                                <tr>
                                    <th style={{ width: 40 }}>#</th>
                                    <th>Query</th>
                                    <th>Expected Docs</th>
                                    <th>Expected Keywords</th>
                                    <th style={{ width: 40 }} />
                                </tr>
                            </thead>
                            <tbody>
                                {dataset.map((c, i) => (
                                    <tr key={c.id || i}>
                                        <td>{i + 1}</td>
                                        <td>
                                            <input
                                                className={styles.editableCell}
                                                value={c.query}
                                                onChange={e => updateCase(i, 'query', e.target.value)}
                                            />
                                        </td>
                                        <td>
                                            <input
                                                className={styles.editableCell}
                                                value={c.expected_doc_names.join(', ')}
                                                onChange={e => updateCase(i, 'expected_doc_names', e.target.value)}
                                                title="Comma-separated"
                                            />
                                        </td>
                                        <td>
                                            <input
                                                className={styles.editableCell}
                                                value={c.expected_keywords.join(', ')}
                                                onChange={e => updateCase(i, 'expected_keywords', e.target.value)}
                                                title="Comma-separated"
                                            />
                                        </td>
                                        <td>
                                            <button
                                                className={styles.deleteRowBtn}
                                                onClick={() => removeCase(i)}
                                                title="Remove"
                                            >
                                                <i className="fas fa-trash-alt" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <button className={styles.addRowBtn} onClick={addEmptyCase}>
                    <i className="fas fa-plus" style={{ marginRight: 6 }} />
                    Add Row
                </button>
            </div>
        </div>
    );
}
