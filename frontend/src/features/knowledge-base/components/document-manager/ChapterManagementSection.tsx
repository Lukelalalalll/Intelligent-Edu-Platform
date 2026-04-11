import React from 'react';
import styles from '../../styles/docManager.module.css';
import type { ChapterDraft } from './types';

export default function ChapterManagementSection({
    chapters,
    chapterDraftMap,
    setChapterDraftMap,
    selectedChapterId,
    onSelectChapter,
    handleUpdateChapter,
    handleDeleteChapter,
    chapterBusy,
}: {
    chapters: any[];
    chapterDraftMap: Record<string, ChapterDraft>;
    setChapterDraftMap: React.Dispatch<React.SetStateAction<Record<string, ChapterDraft>>>;
    selectedChapterId: string;
    onSelectChapter: (chapterId: string) => void;
    handleUpdateChapter: (chapterId: string, draft: ChapterDraft) => Promise<void>;
    handleDeleteChapter: (chapterId: string) => Promise<void>;
    chapterBusy: boolean;
}) {
    return (
        <div className={styles['settings-box']}>
            <h4 className={styles['section-title']} style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>
                <i className="fas fa-layer-group"></i> Chapter Management
            </h4>
            {chapters.length === 0 ? (
                <p style={{ color: 'var(--text-sub)' }}>No chapters yet. Create one before assigning documents.</p>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {chapters.map(ch => {
                        const draft = chapterDraftMap[ch.chapter_id] || {
                            chapter_name: ch.chapter_name || '',
                            chapter_order: Number(ch.chapter_order || 1),
                            description: ch.description || '',
                            diagnostic_enabled: Boolean(ch.diagnostic_enabled),
                        };
                        return (
                            <div key={ch.chapter_id} className={styles.chapterCard}>
                                <div className={styles.chapterCardTop}>
                                    <div className={styles.chapterFieldName}>
                                        <label className={styles.chapterFieldLabel}>Chapter Name</label>
                                        <input
                                            value={draft.chapter_name}
                                            onChange={e => setChapterDraftMap(prev => ({ ...prev, [ch.chapter_id]: { ...draft, chapter_name: e.target.value } }))}
                                            className={styles.chapterInput}
                                            placeholder="Name"
                                        />
                                    </div>
                                    <div className={styles.chapterFieldOrder}>
                                        <label className={styles.chapterFieldLabel}>Order</label>
                                        <input
                                            type="number"
                                            min={1}
                                            value={draft.chapter_order}
                                            onChange={e => setChapterDraftMap(prev => ({ ...prev, [ch.chapter_id]: { ...draft, chapter_order: Number(e.target.value || 1) } }))}
                                            className={styles.chapterInput}
                                            placeholder="Order"
                                        />
                                    </div>
                                    <div className={styles.chapterFieldDescription}>
                                        <label className={styles.chapterFieldLabel}>Description</label>
                                        <input
                                            value={draft.description}
                                            onChange={e => setChapterDraftMap(prev => ({ ...prev, [ch.chapter_id]: { ...draft, description: e.target.value } }))}
                                            className={styles.chapterInput}
                                            placeholder="Optional Description"
                                        />
                                    </div>
                                </div>
                                <div className={styles.chapterCardBottom}>
                                    <label className={styles.chapterEnableLabel}>
                                        <input
                                            type="checkbox"
                                            checked={draft.diagnostic_enabled}
                                            onChange={e => setChapterDraftMap(prev => ({ ...prev, [ch.chapter_id]: { ...draft, diagnostic_enabled: e.target.checked } }))}
                                            className={styles.chapterEnableCheckbox}
                                        />
                                        Diagnostics Enabled
                                    </label>
                                    <div className={styles.chapterActions}>
                                        <button
                                            onClick={() => onSelectChapter(ch.chapter_id)}
                                            className={`${styles.chapterSelectBtn} ${selectedChapterId === ch.chapter_id ? styles.chapterSelectBtnActive : ''}`}
                                        >
                                            {selectedChapterId === ch.chapter_id ? <><i className={`fas fa-check-circle ${styles.chapterSelectedIcon}`}></i> Selected</> : 'Select'}
                                        </button>
                                        <button
                                            onClick={() => handleUpdateChapter(ch.chapter_id, draft)}
                                            disabled={chapterBusy}
                                            className={`${styles.chapterActionBtn} ${styles.chapterSaveBtn}`}
                                        >
                                            <i className="fas fa-save"></i> Save Updates
                                        </button>
                                        <button
                                            onClick={() => handleDeleteChapter(ch.chapter_id)}
                                            disabled={chapterBusy}
                                            className={`${styles.chapterActionBtn} ${styles.chapterDeleteBtn}`}
                                        >
                                            <i className="fas fa-trash-alt"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
