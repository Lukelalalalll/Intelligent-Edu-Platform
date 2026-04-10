import React from 'react';
import styles from '../../styles/KnowledgeBase.module.css';

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
        <div className={`${styles['doc-list-section']} ${styles.tightSection}`}>
            <h4 className={styles['doc-list-title']}>
                <i className="fas fa-sliders-h"></i> Chapter Diagnostic Config
            </h4>
            {!selectedChapterId ? (
                <p className={styles['empty-hint']}>Select a chapter first.</p>
            ) : (
                <div className={styles.configRow}>
                    <div className={styles.configField}>
                        <label className={styles.configLabel}>Question Count</label>
                        <input
                            type="number"
                            min={3}
                            max={12}
                            value={configDraft.question_count}
                            onChange={e => setConfigDraft(prev => ({ ...prev, question_count: Number(e.target.value || 5) }))}
                            className={styles.configInput}
                            title="Number of diagnostic questions to serve students"
                        />
                    </div>
                    <div className={styles.configField}>
                        <label className={styles.configLabel}>Pass Score (%)</label>
                        <input
                            type="number"
                            min={0}
                            max={100}
                            value={configDraft.pass_score}
                            onChange={e => setConfigDraft(prev => ({ ...prev, pass_score: Number(e.target.value || 70) }))}
                            className={styles.configInput}
                            title="Minimum score required to master the chapter concepts"
                        />
                    </div>
                    <div className={styles.configField}>
                        <label className={styles.configLabel}>Time Limit (mins)</label>
                        <input
                            type="number"
                            min={5}
                            max={120}
                            value={configDraft.time_limit_minutes}
                            onChange={e => setConfigDraft(prev => ({ ...prev, time_limit_minutes: Number(e.target.value || 20) }))}
                            className={styles.configInput}
                            title="Amount of time students have to complete the diagnostic"
                        />
                    </div>
                    <button onClick={() => onSaveChapterConfig(selectedChapterId, configDraft)} className={styles.configSaveBtn}>
                        <i className="fas fa-save"></i> Save Config
                    </button>
                </div>
            )}
        </div>
    );
}
