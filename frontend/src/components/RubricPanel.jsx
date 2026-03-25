import { useEffect, useState } from 'react';

export default function RubricPanel({ rubric = {}, existingScores = {}, onSave }) {
    const [scores, setScores] = useState(existingScores || {});
    const [total, setTotal] = useState(existingScores?.totalScore || '');
    const [note, setNote] = useState(existingScores?.overallFeedback || '');

    useEffect(() => {
        setScores(existingScores?.rubricScores || {});
        setTotal(existingScores?.totalScore || '');
        setNote(existingScores?.overallFeedback || '');
    }, [existingScores]);

    const handleChange = (key, value) => {
        setScores((prev) => ({ ...prev, [key]: Number(value) }));
    };

    return (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, display: 'grid', gap: 10 }}>
            <div style={{ fontWeight: 700 }}>Rubric Scores</div>
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
                onClick={() => onSave?.({ totalScore: Number(total), rubricScores: scores, overallFeedback: note })}
                style={{ padding: '10px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer' }}
            >
                Save Scores
            </button>
        </div>
    );
}
