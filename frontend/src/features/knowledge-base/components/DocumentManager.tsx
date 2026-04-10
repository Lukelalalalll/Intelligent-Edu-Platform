import React, { useEffect, useState } from 'react';
import styles from '../styles/KnowledgeBase.module.css';
import UploadZone from './UploadZone';
import DocumentRow from './DocumentRow';
import AddChapterModal from './document-manager/AddChapterModal';
import TestRetrievalPanel from './document-manager/TestRetrievalPanel';
import DiagnosticReportsPanel from './document-manager/DiagnosticReportsPanel';
import { knowledgeBaseApi } from '../../../api/knowledgeBaseApi';
import type { IndexedDoc } from '../../../api/knowledgeBaseApi';
import type { DiagnosticChapter, DiagnosticConfig, DiagnosticReport } from '../../../api/diagnosticApi';

interface ChapterDraft {
    chapter_name: string;
    chapter_order: number;
    description: string;
    diagnostic_enabled: boolean;
}

function toErrorMessage(err: unknown, fallback: string): string {
    const maybeErr = err as { response?: { data?: { detail?: unknown } }; message?: string };
    const detail = maybeErr?.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (typeof maybeErr?.message === 'string' && maybeErr.message.trim()) return maybeErr.message;
    return fallback;
}

export interface UploadTask {
    taskId: string;
    file: File;
    progress: number;
    status: 'uploading' | 'done' | 'error';
    error?: string;
    chunkCount?: number;
}

interface DocumentManagerProps {
    courseId: string;
    courseName: string;
    documents: IndexedDoc[];
    loadingDocs: boolean;
    uploadTasks: UploadTask[];
    deletingDoc: string | null;
    onUploadFile: (file: File) => void;
    onDeleteDoc: (docName: string) => void;
    uploading: boolean;
    chapters: DiagnosticChapter[];
    selectedChapterId: string;
    onSelectChapter: (chapterId: string) => void;
    onCreateChapter: (chapterName: string, description?: string) => Promise<void>;
    onUpdateChapter: (chapterId: string, payload: Partial<Pick<DiagnosticChapter, 'chapter_name' | 'chapter_order' | 'description' | 'diagnostic_enabled'>>) => Promise<void>;
    onDeleteChapter: (chapterId: string) => Promise<void>;
    selectedChapterConfig: DiagnosticConfig | null;
    onSaveChapterConfig: (chapterId: string, payload: { question_count: number; pass_score: number; time_limit_minutes: number }) => void;
    onReassignDocChapter: (docName: string, chapterId: string) => void;
    reports: DiagnosticReport[];
    onSaveReportComment: (reportId: string, comment: string) => void;
}

export default function DocumentManager({
    courseId, courseName, documents, loadingDocs,
    uploadTasks, deletingDoc, onUploadFile, onDeleteDoc, uploading,
    chapters, selectedChapterId, onSelectChapter, onCreateChapter,
    onUpdateChapter, onDeleteChapter, selectedChapterConfig, onSaveChapterConfig,
    onReassignDocChapter, reports, onSaveReportComment,
}: DocumentManagerProps) {
    const [testQuery, setTestQuery] = useState('');
    const [testTopK, setTestTopK] = useState(5);
    const [testResults, setTestResults] = useState<{ course_id: string; text: string; score: number; doc_name: string; chapter_id?: string }[] | null>(null);
    const [testLatency, setTestLatency] = useState<number | null>(null);
    const [testLoading, setTestLoading] = useState(false);
    const [newChapterName, setNewChapterName] = useState('');
    const [newChapterDescription, setNewChapterDescription] = useState('');
    const [reportCommentMap, setReportCommentMap] = useState<Record<string, string>>({});
    const [chapterDraftMap, setChapterDraftMap] = useState<Record<string, ChapterDraft>>({});
    const [configDraft, setConfigDraft] = useState<{ question_count: number; pass_score: number; time_limit_minutes: number }>({
        question_count: 5,
        pass_score: 70,
        time_limit_minutes: 20,
    });
    const [isAddChapterModalOpen, setIsAddChapterModalOpen] = useState(false);
    const [chapterBusy, setChapterBusy] = useState(false);
    const [chapterActionError, setChapterActionError] = useState('');
    const [chapterActionSuccess, setChapterActionSuccess] = useState('');

    useEffect(() => {
        const next: Record<string, ChapterDraft> = {};
        for (const c of chapters) {
            next[c.chapter_id] = {
                chapter_name: c.chapter_name || '',
                chapter_order: Number(c.chapter_order || 1),
                description: c.description || '',
                diagnostic_enabled: Boolean(c.diagnostic_enabled),
            };
        }
        setChapterDraftMap(next);
    }, [chapters]);

    useEffect(() => {
        if (!selectedChapterConfig) {
            setConfigDraft({ question_count: 5, pass_score: 70, time_limit_minutes: 20 });
            return;
        }
        setConfigDraft({
            question_count: Number(selectedChapterConfig.question_count || 5),
            pass_score: Number(selectedChapterConfig.pass_score || 70),
            time_limit_minutes: Number(selectedChapterConfig.time_limit_minutes || 20),
        });
    }, [selectedChapterConfig]);

    const handleTestRetrieval = async () => {
        if (!testQuery.trim() || testLoading) return;
        setTestLoading(true);
        setTestResults(null);
        try {
            const res = await knowledgeBaseApi.testRetrieval(courseId, testQuery.trim(), selectedChapterId, testTopK);
            setTestResults(res.results);
            setTestLatency(res.latency_ms);
        } catch {
            setTestResults([]);
        } finally {
            setTestLoading(false);
        }
    };

    const runChapterAction = async (action: () => Promise<void>, successMessage: string, failureMessage: string) => {
        setChapterBusy(true);
        setChapterActionError('');
        setChapterActionSuccess('');
        try {
            await action();
            setChapterActionSuccess(successMessage);
        } catch (err) {
            setChapterActionError(toErrorMessage(err, failureMessage));
        } finally {
            setChapterBusy(false);
        }
    };

    const handleCreateChapter = async () => {
        const chapterName = newChapterName.trim();
        if (!chapterName) {
            setChapterActionError('Please enter a chapter name before creating.');
            setChapterActionSuccess('');
            return;
        }
        await runChapterAction(
            async () => {
                await onCreateChapter(chapterName, newChapterDescription.trim());
                setNewChapterName('');
                setNewChapterDescription('');
                setIsAddChapterModalOpen(false);
            },
            'Chapter created successfully.',
            'Failed to create chapter'
        );
    };

    const handleUpdateChapter = async (chapterId: string, draft: ChapterDraft) => {
        await runChapterAction(
            async () => onUpdateChapter(chapterId, draft),
            'Chapter updated successfully.',
            'Failed to update chapter'
        );
    };

    const handleDeleteChapter = async (chapterId: string) => {
        if (!window.confirm('Are you sure you want to delete this chapter?')) return;
        await runChapterAction(
            async () => onDeleteChapter(chapterId),
            'Chapter deleted successfully.',
            'Failed to delete chapter'
        );
    };

    return (
        <section className={styles['doc-manager']}>
            <div className={styles['doc-manager-header']}>
                <h3>{courseName}</h3>
                <span className={styles['course-id-tag']}>{courseId}</span>
            </div>

            <div className={styles.chapterToolbar}>
                <select
                    value={selectedChapterId}
                    onChange={e => onSelectChapter(e.target.value)}
                    className={styles.chapterSelect}
                >
                    {chapters.length === 0 && <option value="">No chapter configured</option>}
                    {chapters.map(c => (
                        <option key={c.chapter_id} value={c.chapter_id}>{`#${c.chapter_order} ${c.chapter_name}`}</option>
                    ))}
                </select>
                <button
                    onClick={() => {
                        setNewChapterName('');
                        setNewChapterDescription('');
                        setChapterActionError('');
                        setChapterActionSuccess('');
                        setIsAddChapterModalOpen(true);
                    }}
                    className={styles.addChapterBtn}
                >
                    <i className="fas fa-plus"></i> Add Chapter
                </button>
            </div>

            {chapterActionError && (
                <p className={`${styles['empty-hint']} ${styles.chapterActionError}`}>
                    {chapterActionError}
                </p>
            )}
            {chapterActionSuccess && (
                <p className={`${styles['empty-hint']} ${styles.chapterActionSuccess}`}>
                    {chapterActionSuccess}
                </p>
            )}

            {!selectedChapterId && (
                <p className={`${styles['empty-hint']} ${styles.chapterHint}`}> 
                    Select a chapter first. Knowledge files must be uploaded into a chapter.
                </p>
            )}

            <div className={`${styles['doc-list-section']} ${styles.tightSection}`}>
                <h4 className={styles['doc-list-title']}>
                    <i className="fas fa-layer-group"></i> Chapter Management
                </h4>
                {chapters.length === 0 ? (
                    <p className={styles['empty-hint']}>No chapters yet. Create one before assigning documents.</p>
                ) : (
                    <div className={styles.chapterList}>
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
                        <button
                            onClick={() => onSaveChapterConfig(selectedChapterId, configDraft)}
                            className={styles.configSaveBtn}
                        >
                            <i className="fas fa-save"></i> Save Config
                        </button>
                    </div>
                )}
            </div>

            <UploadZone courseId={courseId} onUpload={onUploadFile} disabled={uploading || !selectedChapterId} />

            {/* Active upload tasks */}
            {uploadTasks.length > 0 && (
                <div className={styles['upload-tasks']}>
                    {uploadTasks.map(t => (
                        <div key={t.taskId} className={styles['upload-task']}>
                            <div className={styles['upload-task-info']}>
                                <i className="fas fa-file" />
                                <span>{t.file.name}</span>
                                {t.status === 'done' && <span className={styles['upload-ok']}>✓ {t.chunkCount} chunks</span>}
                                {t.status === 'error' && <span className={styles['upload-err']}>{t.error || 'Failed'}</span>}
                            </div>
                            {t.status === 'uploading' && (
                                <div className={styles['progress-bar']}>
                                    <div className={styles['progress-fill']} style={{ width: `${t.progress}%` }} />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Document list */}
            <div className={styles['doc-list-section']}>
                <h4 className={styles['doc-list-title']}>
                    <i className="fas fa-database"></i> Indexed Documents
                    {!loadingDocs && <span className={styles['doc-count']}>{documents.length}</span>}
                </h4>

                {loadingDocs ? (
                    <div className={styles['spinner-wrapper']}><div className={styles['spinner']} /></div>
                ) : documents.length === 0 ? (
                    <p className={styles['empty-hint']}>No documents indexed yet. Upload files above to build the knowledge base.</p>
                ) : (
                    <div className={styles['doc-list']}>
                        {documents.map(d => (
                            <div key={d.doc_name} className={styles.documentEntry}>
                                <DocumentRow
                                    doc={d}
                                    onDelete={onDeleteDoc}
                                    deleting={deletingDoc === d.doc_name}
                                />
                                <div className={styles.docChapterRow}>
                                    <span className={styles.docChapterLabel}>Chapter:</span>
                                    <select
                                        value={d.chapter_id || ''}
                                        onChange={e => onReassignDocChapter(d.doc_name, e.target.value)}
                                        className={styles.docChapterSelect}
                                    >
                                        <option value="">Unassigned</option>
                                        {chapters.map(ch => (
                                            <option key={ch.chapter_id} value={ch.chapter_id}>{ch.chapter_name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <TestRetrievalPanel
                testQuery={testQuery}
                testTopK={testTopK}
                testLatency={testLatency}
                testLoading={testLoading}
                testResults={testResults}
                onChangeQuery={setTestQuery}
                onChangeTopK={setTestTopK}
                onSearch={handleTestRetrieval}
            />

            <DiagnosticReportsPanel
                reports={reports}
                reportCommentMap={reportCommentMap}
                onChangeComment={(reportId, value) => setReportCommentMap(prev => ({ ...prev, [reportId]: value }))}
                onSaveComment={(reportId, value) => onSaveReportComment(reportId, value)}
            />

            <AddChapterModal
                isOpen={isAddChapterModalOpen}
                busy={chapterBusy}
                chapterName={newChapterName}
                chapterDescription={newChapterDescription}
                error={chapterActionError}
                onClose={() => setIsAddChapterModalOpen(false)}
                onChangeChapterName={setNewChapterName}
                onChangeChapterDescription={setNewChapterDescription}
                onCreate={handleCreateChapter}
            />
        </section>
    );
}
