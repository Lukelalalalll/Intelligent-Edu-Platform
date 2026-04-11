import React from 'react';
import styles from '../../styles/docManager.module.css';

export default function DiagnosticConfigSection({
    selectedChapterId,
    configDraft,
    setConfigDraft,
    onSaveChapterConfig,
}: {
    selectedChapterId: string;
    configDraft: { question_count: number; pass_score: number; time_limit_minutes: number };
    setConfigDraft: React.Dispatch<React.SetStateAction<{ question_count: number; pass_score: number; time_limit_minutes: number }>>;
    onSaveChapterConfig: (chapterId: string, payload: { question_count: number; pass_score: number; time_limit_minutes: number }) => void;
}) {
    return (
        <div className={styles['settings-box']}>
            <h4 className={styles['section-title']} style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>
                <i className="fas fa-sliders-h"></i> Chapter Diagnostic Config
            </h4>
            {!selectedChapterId ? (
                <p style={{ color: 'var(--text-sub)' }}>Select a chapter first.</p>
            ) : (
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '120px' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-sub)', display: 'block', marginBottom: '0.4rem' }}>Question Count</label>
                        <input
                            type="number"
                            min={3}
                            max={12}
                            value={configDraft.question_count}
                            onChange={e => setConfigDraft(prev => ({ ...prev, question_count: Number(e.target.value || 5) }))}
                            className={styles['form-input']}
                            title="Number of diagnostic questions to serve students"
                        />
                    </div>
                    <div style={{ flex: 1, minWidth: '120px' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-sub)', display: 'block', marginBottom: '0.4rem' }}>Pass Score (%)</label>
                        <input
                            type="number"
                            min={0}
                            max={100}
                            value={configDraft.pass_score}
                            onChange={e => setConfigDraft(prev => ({ ...prev, pass_score: Number(e.target.value || 70) }))}
                            className={styles['form-input']}
                            title="Minimum score required to master the chapter concepts"
                        />
                    </div>
                    <div style={{ flex: 1, minWidth: '120px' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-sub)', display: 'block', marginBottom: '0.4rem' }}>Time Limit (mins)</label>
                        <input
                            type="number"
                            min={5}
                            max={120}
                            value={configDraft.time_limit_minutes}
                            onChange={e => setConfigDraft(prev => ({ ...prev, time_limit_minutes: Number(e.target.value || 20) }))}
                            className={styles['form-input']}
                            title="Amount of time students have to complete the diagnostic"
                        />
                    </div>
                    <button onClick={() => onSaveChapterConfig(selectedChapterId, configDraft)} className={styles['primary-btn']} style={{ height: '42px', padding: '0 1.5rem' }}>
                        <i className="fas fa-save"></i> Save Config
                    </button>
                </div>
            )}
        </div>
    );
}
