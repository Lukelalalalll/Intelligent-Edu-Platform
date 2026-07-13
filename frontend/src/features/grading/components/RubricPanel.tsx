import { useEffect, useState } from 'react';
import type {
    WorkbenchGrade,
    WorkbenchRubric,
} from '../types/workbench';

interface CustomRow {
    id: string;
    question: string;
    score: string;
}

interface RubricPanelProps {
    rubric?: WorkbenchRubric;
    existingScores?: WorkbenchGrade | null;
    onSave?: (data: WorkbenchGrade) => void | Promise<void>;
}

export default function RubricPanel({ rubric = {}, existingScores, onSave }: RubricPanelProps) {
    const [scores, setScores] = useState<Record<string, number | string>>(existingScores?.rubricScores || {});
    const [total, setTotal] = useState(existingScores?.totalScore || '');
    const [note, setNote] = useState(existingScores?.overallFeedback || '');
    const [customRows, setCustomRows] = useState<CustomRow[]>([]);

    useEffect(() => {
        const nextScores = existingScores?.rubricScores || {};
        setScores(nextScores);
        setTotal(existingScores?.totalScore || '');
        setNote(existingScores?.overallFeedback || '');

        const builtInKeys = new Set(Object.keys(rubric || {}));
        const extras = Object.entries(nextScores)
            .filter(([key]) => !builtInKeys.has(key))
            .map(([key, value], idx) => ({
                id: `custom_${Date.now()}_${idx}`,
                question: key,
                score: value === undefined || value === null ? '' : String(value),
            }));
        setCustomRows(extras);
    }, [existingScores, rubric]);

    const handleChange = (key: string, value: string) => {
        setScores((prev) => ({ ...prev, [key]: value === '' ? '' : Number(value) }));
    };

    const handleAddCustomRow = () => {
        setCustomRows((prev) => [
            ...prev,
            {
                id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                question: '',
                score: '',
            },
        ]);
    };

    const handleCustomRowChange = (id: string, field: keyof CustomRow, value: string) => {
        setCustomRows((prev) =>
            prev.map((row) => (row.id === id ? { ...row, [field]: value } : row))
        );
    };

    const handleRemoveCustomRow = (id: string) => {
        setCustomRows((prev) => prev.filter((row) => row.id !== id));
    };

    const handleSave = () => {
        const builtInKeys = Object.keys(rubric || {});
        const normalizedScores: Record<string, number> = {};

        builtInKeys.forEach((key) => {
            const value = scores[key];
            if (value !== '' && value !== undefined && value !== null) {
                normalizedScores[key] = Number(value);
            }
        });

        customRows.forEach((row) => {
            const question = row.question.trim();
            if (!question) return;
            if (row.score === '' || row.score === undefined || row.score === null) return;
            normalizedScores[question] = Number(row.score);
        });

        onSave?.({
            totalScore: Number(total),
            rubricScores: normalizedScores,
            overallFeedback: note,
        });
    };

    return (
        <div
            style={{
                border: '1px solid #e5e7eb',
                borderRadius: 10,
                padding: 12,
                display: 'grid',
                gap: 10,
                height: '100%',
                minHeight: 0,
                overflowY: 'auto',
                alignContent: 'start',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontWeight: 700 }}>Rubric Scores</div>
                <button
                    type="button"
                    onClick={handleAddCustomRow}
                    title="Add custom score row"
                    style={{
                        width: 30,
                        height: 30,
                        borderRadius: '50%',
                        border: '1px solid #16a34a',
                        background: '#ecfdf3',
                        color: '#15803d',
                        fontSize: 18,
                        lineHeight: '1',
                        fontWeight: 700,
                        cursor: 'pointer',
                    }}
                >
                    +
                </button>
            </div>
            {Object.entries(rubric).map(([key, max]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 140, textTransform: 'capitalize' }}>{key}</div>
                    <input
                        type="number"
                        min={0}
                        max={max}
                        value={scores[key] ?? ''}
                        onChange={(e) => handleChange(key, e.target.value)}
                        style={{ flex: 1, padding: '8px', borderRadius: 8, border: '1px solid #e5e7eb' }}
                    />
                    <span style={{ fontSize: 12, color: '#6b7280' }}>/ {max}</span>
                </div>
            ))}
            {customRows.map((row) => (
                <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                        type="text"
                        value={row.question}
                        onChange={(e) => handleCustomRowChange(row.id, 'question', e.target.value)}
                        placeholder="Question number (e.g. Q1 / Problem 1)"
                        style={{
                            width: 160,
                            padding: '8px',
                            borderRadius: 8,
                            border: '1px solid #e5e7eb',
                        }}
                    />
                    <input
                        type="number"
                        value={row.score}
                        onChange={(e) => handleCustomRowChange(row.id, 'score', e.target.value)}
                        placeholder="Score"
                        style={{
                            flex: 1,
                            padding: '8px',
                            borderRadius: 8,
                            border: '1px solid #e5e7eb',
                        }}
                    />
                    <button
                        type="button"
                        onClick={() => handleRemoveCustomRow(row.id)}
                        title="Remove row"
                        style={{
                            border: '1px solid #fecaca',
                            background: '#fff1f2',
                            color: '#be123c',
                            borderRadius: 8,
                            padding: '6px 10px',
                            cursor: 'pointer',
                            fontWeight: 700,
                        }}
                    >
                        x
                    </button>
                </div>
            ))}
            <div>
                <label style={{ fontSize: 12, color: '#6b7280' }}>Total Score</label>
                <input
                    type="number"
                    value={total}
                    onChange={(e) => setTotal(e.target.value)}
                    style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid #e5e7eb' }}
                />
            </div>
            <div>
                <label style={{ fontSize: 12, color: '#6b7280' }}>Overall Feedback</label>
                <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid #e5e7eb' }}
                />
            </div>
            <button
                onClick={handleSave}
                style={{ padding: '10px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer' }}
            >
                Save Scores
            </button>
        </div>
    );
}
