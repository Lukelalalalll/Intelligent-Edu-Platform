import React, { useCallback, useMemo, useState } from 'react';
import styles from '../styles/RagEvaluator.module.css';
import WelcomeBanner from '../../../shared/components/WelcomeBanner';
import StepConfig from '../components/StepConfig';
import type { EvalConfig } from '../components/StepConfig';
import StepDataset from '../components/StepDataset';
import StepResults from '../components/StepResults';
import * as api from '../api/ragEvaluatorApi';
import type { TestCase, EvalABResult } from '../api/ragEvaluatorApi';

type Step = 1 | 2 | 3;

const STEP_LABELS: Record<Step, string> = {
    1: 'Configure',
    2: 'Test Data',
    3: 'Results',
};

function loadSavedConfig(): EvalConfig {
    try {
        const raw = localStorage.getItem('ragEvaluatorConfig');
        if (raw) {
            const parsed = JSON.parse(raw);
            return {
                courseId: parsed.courseId || '',
                selectedDocs: parsed.selectedDocs || [],
                mode: parsed.mode || 'comparison',
                topK: parsed.topK || 4,
                ragProfile: parsed.ragProfile || 'balanced',
                debugRetrieval: !!parsed.debugRetrieval,
                allowWebCorrection: !!parsed.allowWebCorrection,
                forceQueryClass: parsed.forceQueryClass || '',
            };
        }
    } catch { /* ignore */ }
    return {
        courseId: '',
        selectedDocs: [],
        mode: 'comparison',
        topK: 4,
        ragProfile: 'balanced',
        debugRetrieval: false,
        allowWebCorrection: false,
        forceQueryClass: '',
    };
}

function saveConfig(config: EvalConfig) {
    localStorage.setItem('ragEvaluatorConfig', JSON.stringify(config));
}

export default function RagEvaluatorPage() {
    const [step, setStep] = useState<Step>(1);
    const [config, setConfig] = useState<EvalConfig>(loadSavedConfig);
    const [dataset, setDataset] = useState<TestCase[]>([]);
    const [results, setResults] = useState<EvalABResult | null>(null);
    const [evaluating, setEvaluating] = useState(false);
    const [error, setError] = useState('');

    const handleConfigChange = useCallback((c: EvalConfig) => {
        setConfig(c);
        saveConfig(c);
    }, []);

    const canGoToStep2 = !!config.courseId;
    const canGoToStep3 = dataset.length > 0;
    const quality = useMemo(() => {
        const invalid = dataset.filter(d => !d.query?.trim() || !(d.course_ids || []).length).length;
        const degenerate = dataset.filter(d => (d.expected_doc_names?.length || 0) === 0 && (d.expected_keywords?.length || 0) === 0).length;
        const evaluable = Math.max(0, dataset.length - invalid - degenerate);
        const degenerateRatio = dataset.length > 0 ? degenerate / dataset.length : 0;
        const ok = dataset.length > 0 && invalid === 0 && evaluable > 0 && degenerateRatio <= 0.2;
        return { invalid, degenerate, evaluable, degenerateRatio, ok };
    }, [dataset]);

    const handleRunEvaluation = useCallback(async () => {
        if (!canGoToStep3) return;
        if (!quality.ok) {
            if (quality.invalid > 0) {
                setError(`Dataset has ${quality.invalid} invalid case(s) with empty query or missing course_ids.`);
            } else if (quality.evaluable <= 0) {
                setError('No evaluable cases. Add expected_doc_names or expected_keywords to at least one test case.');
            } else {
                setError(`Too many cases without evaluation criteria (${Math.round(quality.degenerateRatio * 100)}%). Keep it <= 20%.`);
            }
            return;
        }
        setEvaluating(true);
        setError('');
        setStep(3);
        setResults(null);
        try {
            const result = await api.evaluateAB(
                dataset,
                config.topK,
                config.mode,
                config.selectedDocs.length > 0 ? config.selectedDocs : undefined,
                config.ragProfile,
                config.debugRetrieval,
                config.allowWebCorrection,
                config.forceQueryClass,
            );
            setResults(result);
        } catch (e: unknown) {
            const message = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            setError(message || 'Evaluation failed');
        } finally {
            setEvaluating(false);
        }
    }, [
        canGoToStep3,
        dataset,
        config.topK,
        config.mode,
        config.selectedDocs,
        config.ragProfile,
        config.debugRetrieval,
        config.allowWebCorrection,
        config.forceQueryClass,
        quality,
    ]);

    const completedSteps = new Set<Step>();
    if (canGoToStep2) completedSteps.add(1);
    if (canGoToStep3) completedSteps.add(2);
    if (results) completedSteps.add(3);

    return (
        <div className={styles.page}>
            <WelcomeBanner
                title="RAG Evaluator"
                subtitle="Evaluate retrieval quality with A/B comparison between Hybrid and Vector-Only modes"
                as="header"
                variant="workspace"
            />

            {/* Stepper */}
            <div className={styles.stepperWrap}>
                {([1, 2, 3] as Step[]).map(s => {
                    const isDone = completedSteps.has(s) && step !== s;
                    const isActive = step === s;
                    return (
                        <div
                            key={s}
                            className={`${styles.stepperItem} ${isDone ? styles.stepperItemDone : ''} ${isActive ? styles.stepperItemActive : ''}`}
                            onClick={() => {
                                if (s === 2 && !canGoToStep2) return;
                                if (s === 3 && !canGoToStep3) return;
                                setStep(s);
                            }}
                            style={{ cursor: ((s === 2 && !canGoToStep2) || (s === 3 && !canGoToStep3)) ? 'not-allowed' : (isDone ? 'pointer' : 'default') }}
                        >
                            <div className={styles.stepperCircle}>
                                {isDone ? <i className="fas fa-check" /> : <span>{s}</span>}
                            </div>
                            <span className={styles.stepperLabel}>{STEP_LABELS[s]}</span>
                        </div>
                    );
                })}
            </div>

            {/* Step content */}
            <div className={styles.stepContainer}>
                {step === 1 && (
                    <StepConfig config={config} onChange={handleConfigChange} />
                )}
                {step === 2 && (
                    <StepDataset
                        courseId={config.courseId}
                        selectedDocs={config.selectedDocs}
                        dataset={dataset}
                        onChange={setDataset}
                    />
                )}
                {step === 3 && (
                    <StepResults results={results} loading={evaluating} />
                )}

                {step === 2 && canGoToStep3 && !quality.ok && (
                    <p className={styles.errorText}>
                        Dataset quality check: invalid {quality.invalid}, no-criteria {quality.degenerate}, evaluable {quality.evaluable}. Fix these before running.
                    </p>
                )}

                {error && <p className={styles.errorText}>{error}</p>}

                {/* Navigation */}
                <div className={styles.stepActions}>
                    <div>
                        {step > 1 && (
                            <button
                                className={styles.btnSecondary}
                                onClick={() => setStep((step - 1) as Step)}
                            >
                                <i className="fas fa-arrow-left" style={{ marginRight: 6 }} />
                                Back
                            </button>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {step === 1 && (
                            <button
                                className={styles.btnPrimary}
                                onClick={() => setStep(2)}
                                disabled={!canGoToStep2}
                            >
                                Next: Test Data
                                <i className="fas fa-arrow-right" style={{ marginLeft: 6 }} />
                            </button>
                        )}
                        {step === 2 && (
                            <>
                                <button
                                    className={styles.btnSecondary}
                                    onClick={() => setStep(3)}
                                    disabled={!canGoToStep3}
                                >
                                    View Results
                                </button>
                                <button
                                    className={styles.btnPrimary}
                                    onClick={handleRunEvaluation}
                                    disabled={!canGoToStep3 || evaluating || !quality.ok}
                                >
                                    {evaluating ? (
                                        <>
                                            <i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }} />
                                            Evaluating...
                                        </>
                                    ) : (
                                        <>
                                            <i className="fas fa-play" style={{ marginRight: 6 }} />
                                            Run Evaluation
                                        </>
                                    )}
                                </button>
                            </>
                        )}
                        {step === 3 && !evaluating && (
                            <button
                                className={styles.btnPrimary}
                                onClick={handleRunEvaluation}
                                disabled={!canGoToStep3 || !quality.ok}
                            >
                                <i className="fas fa-redo" style={{ marginRight: 6 }} />
                                Re-run
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
