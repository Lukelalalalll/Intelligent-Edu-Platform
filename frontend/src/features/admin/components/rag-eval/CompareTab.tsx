import React, { useEffect, useState } from 'react';
import styles from '../../styles/RagEvalPanel.module.css';
import * as api from '../../../../api/ragEvalApi';
import type { CompareResult, EvalRun } from '../../../../api/ragEvalApi';

export default function CompareTab() {
    const [runs, setRuns] = useState<EvalRun[]>([]);
    const [baseId, setBaseId] = useState('');
    const [targetId, setTargetId] = useState('');
    const [result, setResult] = useState<CompareResult | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        api.listRuns(100).then(setRuns).catch(console.error);
    }, []);

    const handleCompare = async () => {
        if (!baseId || !targetId) return;
        setLoading(true);
        try {
            setResult(await api.compareRuns(baseId, targetId));
        } catch (e: unknown) {
            const message = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            alert(message || 'Compare failed');
        } finally {
            setLoading(false);
        }
    };

    const runLabel = (run: EvalRun) =>
        `${run.dataset_name} / ${run.course_id.slice(0, 8)} - ${new Date(run.started_at).toLocaleDateString()}`;

    const getToneClass = (value: number, isLatency: boolean) => {
        if (value === 0) return styles.ragToneNeutral;
        if (isLatency) {
            return value < 0 ? styles.ragTonePositive : styles.ragToneNegative;
        }
        return value > 0 ? styles.ragTonePositive : styles.ragToneNegative;
    };

    return (
        <div>
            <h3 className={styles.ragSectionTitleSpaced}>Compare Runs</h3>
            <div className={styles.ragInlineFormRow}>
                <label className={styles.ragSelectLabel}>
                    Base:
                    <select className={`${styles.formInput} ${styles.ragSelectField} ${styles.ragControlXWide}`} value={baseId} onChange={e => setBaseId(e.target.value)}>
                        <option value="">Select base run...</option>
                        {runs.map(run => (
                            <option key={run.run_id} value={run.run_id}>
                                {runLabel(run)}
                            </option>
                        ))}
                    </select>
                </label>
                <label className={styles.ragSelectLabel}>
                    Target:
                    <select className={`${styles.formInput} ${styles.ragSelectField} ${styles.ragControlXWide}`} value={targetId} onChange={e => setTargetId(e.target.value)}>
                        <option value="">Select target run...</option>
                        {runs.map(run => (
                            <option key={run.run_id} value={run.run_id}>
                                {runLabel(run)}
                            </option>
                        ))}
                    </select>
                </label>
                <button className={styles.btnPrimary} onClick={handleCompare} disabled={loading || !baseId || !targetId}>
                    {loading ? 'Comparing...' : 'Compare'}
                </button>
            </div>

            {result && (
                <table className={`${styles.dataTable} ${styles.ragTableFull}`}>
                    <thead>
                        <tr>
                            <th>Metric</th>
                            <th>Base</th>
                            <th>Target</th>
                            <th>Delta</th>
                            <th>Change %</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Object.entries(result.diff).map(([key, diff]) => {
                            const isLatency = key.includes('latency');
                            const deltaToneClass = getToneClass(diff.delta, isLatency);
                            const pctToneClass = getToneClass(diff.pct_change, isLatency);
                            const isRate = key.includes('rate') || key === 'mrr';
                            const formatValue = (value: number) =>
                                isRate ? `${(value * 100).toFixed(1)}%` : isLatency ? `${value.toFixed(1)} ms` : value.toFixed(3);

                            return (
                                <tr key={key}>
                                    <td className={styles.ragMetricKey}>{key}</td>
                                    <td>{formatValue(diff.base)}</td>
                                    <td>{formatValue(diff.target)}</td>
                                    <td className={`${styles.ragDeltaStrong} ${deltaToneClass}`}>
                                        {diff.delta > 0 ? '+' : ''}
                                        {isRate ? `${(diff.delta * 100).toFixed(1)}%` : diff.delta.toFixed(2)}
                                    </td>
                                    <td className={pctToneClass}>
                                        {diff.pct_change > 0 ? '+' : ''}
                                        {diff.pct_change.toFixed(1)}%
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}
        </div>
    );
}
