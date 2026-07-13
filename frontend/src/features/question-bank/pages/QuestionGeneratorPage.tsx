import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ArrowLeft,
    BookCopy,
    Bot,
    CheckCircle2,
    Download,
    FileText,
    FileUp,
    History,
    LoaderCircle,
    PencilLine,
    Plus,
    ScrollText,
    Sparkles,
    Trash2,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

import Button from '@/shared/components/Button/Button';
import PptGeneratorShell, { type PptGeneratorStep } from '@/features/slides/components/PptGeneratorShell';
import ToastContainer from '@/shared/ToastContainer';
import { useToast } from '@/shared/hooks/useToast';
import { aiConfigApi, type AIConfigResponse } from '@/features/ai-config/api/aiConfigApi';
import type { QuestionDraft } from '@/types/api';

import { transferApi } from '../../chat/api/transferApi';
import QuestionMarkdown from '../components/QuestionMarkdown';
import {
    exportQuestionSelection,
    finalizeQuestionHistory,
    getGenerationDetail,
    getGenerationHistory,
    streamGenerateQuestions,
    uploadFile,
    type QuestionGenerationStreamEvent,
} from '../api/questionBankApi';
import { openQuestionPdfExport } from '../exportQuestionPdf';
import {
    getConfiguredQuestionProviders,
    resolveQuestionProvider,
    writeStoredQuestionProvider,
    type QuestionStudioProvider,
} from '../questionProviderConfig';
import { buildQuestionMarkdown, buildQuestionsMarkdown, normalizeQuestionDraft } from '../questionDraftUtils';
import styles from '../styles/questionStudio.module.css';

type StudioView = 'hub' | 'generate';
type WorkspaceStep = 'start' | 'composer' | 'result';

type HistoryState = {
    items: Array<Record<string, any>>;
    loading: boolean;
};

const PROVIDER_LABELS: Record<QuestionStudioProvider, string> = {
    openai: 'OpenAI',
    deepseek: 'DeepSeek',
    bigmodel: 'BigModel / GLM',
};

function downloadBlob(blob: Blob, filename: string) {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
}

function EntryCard({
    title,
    description,
    badge,
    icon,
    onClick,
    disabled = false,
    actionLabel,
}: {
    title: string;
    description: string;
    badge: string;
    icon: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    actionLabel: string;
}) {
    return (
        <div
            className={[
                styles.entryCard,
                onClick && !disabled ? styles.entryCardInteractive : '',
                disabled ? styles.entryCardDisabled : '',
            ].filter(Boolean).join(' ')}
        >
            <div className={styles.entryTop}>
                <div className={styles.entryIcon}>{icon}</div>
                <span className={styles.entryBadge}>{badge}</span>
            </div>
            <div>
                <h2 className={styles.entryTitle}>{title}</h2>
                <p className={styles.entryText}>{description}</p>
            </div>
            <div>
                <Button type="button" onClick={onClick} disabled={disabled}>
                    {actionLabel}
                </Button>
            </div>
        </div>
    );
}

function HistoryStrip({
    items,
    loading,
    onOpen,
}: {
    items: Array<Record<string, any>>;
    loading: boolean;
    onOpen: (historyId: string) => void;
}) {
    return (
        <section className={styles.hubSection}>
            <div className={styles.sectionHeader}>
                <div>
                    <h2 className={styles.sectionTitle}>History</h2>
                    <p className={styles.sectionText}>Recent generated question sets, ready to reopen.</p>
                </div>
            </div>

            {loading ? (
                <div className={styles.emptyState}>Loading question history...</div>
            ) : items.length === 0 ? (
                <div className={styles.emptyState}>No generated question sets yet.</div>
            ) : (
                <div className={styles.historyStrip}>
                    {items.map((item) => (
                        <div key={String(item.id)} className={styles.historyCard}>
                            <div className={styles.historyTop}>
                                <div>
                                    <span className={styles.historyBadge}>
                                        {String(item.params?.question_type || 'Question set')}
                                    </span>
                                    <h3 className={styles.panelTitle} style={{ marginTop: 10 }}>
                                        {Number(item.params?.num_questions || 0) || '?'} questions
                                    </h3>
                                </div>
                                <span className={styles.metaPill}>
                                    {new Date(item.created_at || Date.now()).toLocaleDateString()}
                                </span>
                            </div>
                            <div className={styles.historyMeta}>
                                <span className={styles.metaPill}>Lv {String(item.params?.difficulty || '-')}</span>
                                <span className={styles.metaPill}>{String(item.params?.output_language || 'English')}</span>
                                <span className={styles.metaPill}>{String(item.params?.source_kind || item.params?.source_type || 'text')}</span>
                            </div>
                            <p className={styles.historyPreview}>{String(item.preview || '').trim() || 'No preview available.'}</p>
                            <div>
                                <Button type="button" variant="outline" onClick={() => onOpen(String(item.id))}>
                                    Open Result
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}

function QuestionCard({
    index,
    question,
    selected,
    onToggle,
    onChange,
    onAddOption,
    onRemoveOption,
}: {
    index: number;
    question: QuestionDraft;
    selected: boolean;
    onToggle: () => void;
    onChange: (field: keyof QuestionDraft, value: string, optionIndex?: number) => void;
    onAddOption: () => void;
    onRemoveOption: (optionIndex: number) => void;
}) {
    const previewMarkdown = buildQuestionMarkdown(question, index);

    return (
        <article className={styles.questionCard}>
            <div className={styles.questionHeader}>
                <div>
                    <p className={styles.questionIndex}>Question {index + 1}</p>
                    <p className={styles.mutedText}>Edit the draft, keep the ones you want, and export the final set.</p>
                </div>
                <label className={styles.selectionSummary}>
                    <input type="checkbox" checked={selected} onChange={onToggle} />
                    Include in export
                </label>
            </div>

            <div className={styles.questionGrid}>
                <div className={styles.editorColumn}>
                    <div className={styles.fieldGroup}>
                        <label className={styles.fieldLabel}>Stem</label>
                        <textarea
                            className={styles.textArea}
                            rows={4}
                            value={question.stem}
                            onChange={(event) => onChange('stem', event.target.value)}
                        />
                    </div>

                    <div className={styles.fieldGroup}>
                        <div className={styles.panelTitleRow}>
                            <label className={styles.fieldLabel}>Options</label>
                            <Button type="button" variant="ghost" onClick={onAddOption}>
                                <Plus size={16} /> Add Option
                            </Button>
                        </div>
                        {(question.options || []).length === 0 ? (
                            <div className={styles.emptyState}>No options yet. Add one if this question needs choices.</div>
                        ) : (
                            question.options.map((option, optionIndex) => (
                                <div key={`${question.id}_option_${optionIndex}`} className={styles.optionRow}>
                                    <input
                                        className={styles.textInput}
                                        value={option}
                                        onChange={(event) => onChange('options', event.target.value, optionIndex)}
                                    />
                                    <div className={styles.optionControls}>
                                        <Button type="button" variant="ghost" onClick={() => onRemoveOption(optionIndex)}>
                                            <Trash2 size={16} />
                                        </Button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <div className={styles.fieldGroup}>
                        <label className={styles.fieldLabel}>Answer</label>
                        <textarea
                            className={styles.textArea}
                            rows={2}
                            value={question.answer}
                            onChange={(event) => onChange('answer', event.target.value)}
                        />
                    </div>

                    <div className={styles.fieldGroup}>
                        <label className={styles.fieldLabel}>Explanation</label>
                        <textarea
                            className={styles.textArea}
                            rows={4}
                            value={question.explanation}
                            onChange={(event) => onChange('explanation', event.target.value)}
                        />
                    </div>
                </div>

                <div className={styles.previewPanel}>
                    <div className={styles.panelTitleRow}>
                        <h4 className={styles.panelTitle}>Preview</h4>
                        <span className={styles.statusBadge}>KaTeX Ready</span>
                    </div>
                    <QuestionMarkdown markdown={previewMarkdown} />
                </div>
            </div>
        </article>
    );
}

export default function QuestionGeneratorPage() {
    const { toasts, showToast, removeToast } = useToast();
    const [searchParams, setSearchParams] = useSearchParams();
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const streamAbortRef = useRef<AbortController | null>(null);

    const [view, setView] = useState<StudioView>('hub');
    const [workspaceStep, setWorkspaceStep] = useState<WorkspaceStep>('start');
    const [historyState, setHistoryState] = useState<HistoryState>({ items: [], loading: true });
    const [aiConfig, setAiConfig] = useState<AIConfigResponse | null>(null);
    const [provider, setProvider] = useState<QuestionStudioProvider | null>(null);
    const [providerLoading, setProviderLoading] = useState(true);
    const [sourceText, setSourceText] = useState('');
    const [questionType, setQuestionType] = useState('Multiple choice');
    const [numQuestions, setNumQuestions] = useState(6);
    const [difficulty, setDifficulty] = useState(3);
    const [outputLanguage, setOutputLanguage] = useState('English');
    const [constraints, setConstraints] = useState('');
    const [uploading, setUploading] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [taskId, setTaskId] = useState<string | null>(null);
    const [historyId, setHistoryId] = useState<string | null>(null);
    const [streamPhase, setStreamPhase] = useState('idle');
    const [streamMessage, setStreamMessage] = useState('Ready to generate.');
    const [isGenerating, setIsGenerating] = useState(false);
    const [isSavingHistory, setIsSavingHistory] = useState(false);
    const [questions, setQuestions] = useState<QuestionDraft[]>([]);
    const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);

    const providerOptions = useMemo(() => getConfiguredQuestionProviders(aiConfig), [aiConfig]);
    const selectedQuestions = useMemo(
        () => questions.filter((question) => selectedQuestionIds.includes(question.id)),
        [questions, selectedQuestionIds],
    );

    const shellSteps = useMemo<PptGeneratorStep[]>(() => ([
        { key: 'start', label: 'Start', icon: <Sparkles size={16} /> },
        { key: 'composer', label: 'Compose', icon: <ScrollText size={16} /> },
        { key: 'result', label: 'Review & Export', icon: <CheckCircle2 size={16} /> },
    ]), []);

    const currentStepIndex = workspaceStep === 'start' ? 0 : workspaceStep === 'composer' ? 1 : 2;

    const loadHistory = useCallback(async () => {
        setHistoryState((current) => ({ ...current, loading: true }));
        try {
            const data = await getGenerationHistory(1, 12);
            setHistoryState({ items: Array.isArray(data.items) ? data.items : [], loading: false });
        } catch (error) {
            console.error(error);
            setHistoryState({ items: [], loading: false });
            showToast('Failed to load question history.', 'error');
        }
    }, [showToast]);

    const loadProviders = useCallback(async () => {
        setProviderLoading(true);
        try {
            const config = await aiConfigApi.get();
            setAiConfig(config);
            setProvider(resolveQuestionProvider(config));
        } catch (error) {
            console.error(error);
            showToast('Failed to load AI provider settings.', 'error');
        } finally {
            setProviderLoading(false);
        }
    }, [showToast]);

    useEffect(() => {
        void loadHistory();
        void loadProviders();
    }, [loadHistory, loadProviders]);

    useEffect(() => {
        if (!provider) return;
        writeStoredQuestionProvider(provider);
    }, [provider]);

    useEffect(() => () => {
        streamAbortRef.current?.abort();
    }, []);

    const resetResultState = useCallback(() => {
        setQuestions([]);
        setSelectedQuestionIds([]);
        setHistoryId(null);
        setStreamPhase('idle');
        setStreamMessage('Ready to generate.');
    }, []);

    const handleUploadedFile = useCallback(async (file: File) => {
        if (!file.name.toLowerCase().endsWith('.pdf')) {
            showToast('V1 only supports PDF upload in Question Studio.', 'warning');
            return;
        }
        setUploading(true);
        try {
            const result = await uploadFile(file);
            if (!result.success) {
                throw new Error(result.error || 'Upload failed');
            }
            setSelectedFile(file);
            setTaskId(result.task_id);
            showToast(`Uploaded ${result.filename}.`, 'success');
        } catch (error) {
            console.error(error);
            showToast(error instanceof Error ? error.message : 'Upload failed.', 'error');
        } finally {
            setUploading(false);
        }
    }, [showToast]);

    useEffect(() => {
        const transferId = searchParams.get('transfer_id');
        if (!transferId) return;

        let cancelled = false;
        (async () => {
            try {
                const { file } = await transferApi.transferConsumeAndDownload(transferId);
                if (cancelled) return;
                setView('generate');
                setWorkspaceStep('composer');
                await handleUploadedFile(file);
                const next = new URLSearchParams(searchParams);
                next.delete('transfer_id');
                setSearchParams(next, { replace: true });
            } catch (error) {
                console.error('Transfer consume failed:', error);
                showToast('Failed to import transferred PDF.', 'error');
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [handleUploadedFile, searchParams, setSearchParams, showToast]);

    const hydrateHistoryResult = useCallback(async (targetHistoryId: string) => {
        try {
            const detail = await getGenerationDetail(targetHistoryId);
            const drafts = Array.isArray(detail.question_drafts)
                ? detail.question_drafts.map((item, index) => normalizeQuestionDraft(item, index))
                : [];
            if (!drafts.length) {
                showToast('This history item has no structured questions to reopen.', 'warning');
                return;
            }
            setView('generate');
            setWorkspaceStep('result');
            setQuestions(drafts);
            setSelectedQuestionIds(
                Array.isArray(detail.selected_question_ids) && detail.selected_question_ids.length > 0
                    ? detail.selected_question_ids
                    : drafts.map((item) => item.id),
            );
            setHistoryId(targetHistoryId);
            setStreamPhase('complete');
            setStreamMessage('Loaded final version from history.');
        } catch (error) {
            console.error(error);
            showToast('Failed to open history item.', 'error');
        }
    }, [showToast]);

    const handleStreamEvent = useCallback((event: QuestionGenerationStreamEvent) => {
        if (event.type === 'status') {
            setStreamPhase(event.phase);
            setStreamMessage(event.message);
            return;
        }
        if (event.type === 'question') {
            setQuestions((current) => [...current, normalizeQuestionDraft(event.question, current.length)]);
            return;
        }
        if (event.type === 'complete') {
            const drafts = event.question_drafts.map((item, index) => normalizeQuestionDraft(item, index));
            setQuestions(drafts);
            setSelectedQuestionIds(drafts.map((item) => item.id));
            setHistoryId(event.history_id);
            setTaskId(event.task_id);
            setStreamPhase('complete');
            setStreamMessage('Generation complete. Review and export the questions you want.');
            return;
        }
        setStreamPhase('error');
        setStreamMessage(event.message);
        showToast(event.message, 'error');
    }, [showToast]);

    const handleGenerate = useCallback(async () => {
        if (!provider) {
            showToast('Configure an AI text provider first.', 'warning');
            return;
        }
        if (!sourceText.trim() && !taskId) {
            showToast('Add source text, upload a PDF, or both.', 'warning');
            return;
        }

        streamAbortRef.current?.abort();
        streamAbortRef.current = new AbortController();
        resetResultState();
        setView('generate');
        setWorkspaceStep('result');
        setIsGenerating(true);

        try {
            await streamGenerateQuestions({
                provider,
                task_id: taskId,
                source_text: sourceText.trim(),
                question_type: questionType,
                num_questions: numQuestions,
                difficulty,
                constraints: constraints
                    .split('\n')
                    .map((item) => item.trim())
                    .filter(Boolean),
                output_language: outputLanguage,
                source_type: 'pdf',
                page_numbers: [],
            }, handleStreamEvent, streamAbortRef.current.signal);
            await loadHistory();
        } catch (error) {
            console.error(error);
            showToast(error instanceof Error ? error.message : 'Question generation failed.', 'error');
            setStreamPhase('error');
            setStreamMessage('Question generation failed.');
        } finally {
            setIsGenerating(false);
        }
    }, [
        constraints,
        difficulty,
        handleStreamEvent,
        loadHistory,
        numQuestions,
        outputLanguage,
        provider,
        questionType,
        resetResultState,
        showToast,
        sourceText,
        taskId,
    ]);

    const persistHistory = useCallback(async () => {
        if (!historyId) return;
        setIsSavingHistory(true);
        try {
            await finalizeQuestionHistory(historyId, {
                questions,
                markdown: buildQuestionsMarkdown(questions),
                selected_question_ids: selectedQuestionIds,
            });
        } finally {
            setIsSavingHistory(false);
        }
    }, [historyId, questions, selectedQuestionIds]);

    const handleSaveHistory = useCallback(async () => {
        try {
            await persistHistory();
            showToast('Saved current edits to history.', 'success');
            await loadHistory();
        } catch (error) {
            console.error(error);
            showToast(error instanceof Error ? error.message : 'Failed to save history.', 'error');
        }
    }, [loadHistory, persistHistory, showToast]);

    const handleExport = useCallback(async (format: 'markdown' | 'txt' | 'pdf') => {
        if (selectedQuestions.length === 0) {
            showToast('Select at least one question before exporting.', 'warning');
            return;
        }
        try {
            await persistHistory();
            if (format === 'pdf') {
                openQuestionPdfExport(selectedQuestions);
                return;
            }
            const blob = await exportQuestionSelection({
                questions: selectedQuestions,
                format,
                filename: 'question-studio',
            });
            downloadBlob(blob, format === 'markdown' ? 'question-studio.md' : 'question-studio.txt');
        } catch (error) {
            console.error(error);
            showToast(error instanceof Error ? error.message : 'Export failed.', 'error');
        }
    }, [persistHistory, selectedQuestions, showToast]);

    const updateQuestion = useCallback((questionId: string, field: keyof QuestionDraft, value: string, optionIndex?: number) => {
        setQuestions((current) => current.map((question, index) => {
            if (question.id !== questionId) return question;
            const next = { ...question };
            if (field === 'options') {
                const nextOptions = [...question.options];
                if (typeof optionIndex === 'number') {
                    nextOptions[optionIndex] = value;
                }
                next.options = nextOptions;
            } else {
                (next[field] as string) = value;
            }
            return normalizeQuestionDraft(next, index);
        }));
    }, []);

    const addOption = useCallback((questionId: string) => {
        setQuestions((current) => current.map((question, index) => (
            question.id === questionId
                ? normalizeQuestionDraft({ ...question, options: [...question.options, `${String.fromCharCode(65 + question.options.length)}. `] }, index)
                : question
        )));
    }, []);

    const removeOption = useCallback((questionId: string, optionIndex: number) => {
        setQuestions((current) => current.map((question, index) => (
            question.id === questionId
                ? normalizeQuestionDraft({ ...question, options: question.options.filter((_, currentIndex) => currentIndex !== optionIndex) }, index)
                : question
        )));
    }, []);

    const toggleSelectedQuestion = useCallback((questionId: string) => {
        setSelectedQuestionIds((current) => (
            current.includes(questionId)
                ? current.filter((item) => item !== questionId)
                : [...current, questionId]
        ));
    }, []);

    const toolbar = (
        <div className={styles.toolbarSwitch}>
            <Button type="button" variant={view === 'hub' ? 'primary' : 'outline'} onClick={() => setView('hub')}>
                <BookCopy size={16} /> Studio
            </Button>
            <Button
                type="button"
                variant={view === 'generate' ? 'primary' : 'outline'}
                onClick={() => {
                    setView('generate');
                    setWorkspaceStep((current) => (current === 'result' || current === 'composer' ? current : 'start'));
                }}
            >
                <Bot size={16} /> Generate
            </Button>
        </div>
    );

    return (
        <>
            <PptGeneratorShell
                className="container"
                currentStep={currentStepIndex}
                showStepper={view === 'generate'}
                steps={shellSteps}
                toolbar={toolbar}
                contentClassName={styles.shellContent}
                bannerTitle={<><Sparkles size={20} /> Question Studio</>}
                bannerSubtitle="Generate polished question sets from text, PDF source material, or both, then review, edit, and export them with math-safe rendering."
            >
                {view === 'hub' && (
                    <div className={styles.hubSection}>
                        <div className={styles.heroGrid}>
                            <EntryCard
                                title="Generate Question"
                                description="Start a new question workflow with free-form instructor intent, optional PDF source material, streaming structured results, and export-ready editing."
                                badge="Ready"
                                icon={<Bot size={26} />}
                                actionLabel="Open Generator"
                                onClick={() => {
                                    setView('generate');
                                    setWorkspaceStep('start');
                                }}
                            />
                            <EntryCard
                                title="Extract Question"
                                description="Reserved as the next entry point for extraction-first workflows. The card is live in the layout, but the extraction studio stays parked for now."
                                badge="Coming Soon"
                                icon={<ScrollText size={26} />}
                                actionLabel="Not Yet Available"
                                disabled
                            />
                        </div>

                        <HistoryStrip items={historyState.items} loading={historyState.loading} onOpen={hydrateHistoryResult} />
                    </div>
                )}

                {view === 'generate' && workspaceStep === 'start' && (
                    <section className={styles.workspace}>
                        <div className={styles.startCard}>
                            <div className={styles.startHeader}>
                                <span className={styles.statusBadge}>Start</span>
                                <h2 className={styles.entryTitle}>Choose your source mix, then let the model build the set.</h2>
                                <p className={styles.sectionText}>
                                    Text can stand on its own, PDFs can stand on their own, and when both are present the PDF becomes the source corpus while your text becomes the instructor intent.
                                </p>
                            </div>
                            <div className={styles.startActions}>
                                <Button type="button" onClick={() => setWorkspaceStep('composer')}>
                                    <Sparkles size={16} /> Begin
                                </Button>
                                <Button type="button" variant="outline" onClick={() => setView('hub')}>
                                    <ArrowLeft size={16} /> Back to Studio
                                </Button>
                            </div>
                        </div>
                    </section>
                )}

                {view === 'generate' && workspaceStep === 'composer' && (
                    <section className={styles.workspace}>
                        <div className={styles.composerGrid}>
                            <div className={styles.panel}>
                                <div className={styles.panelTitleRow}>
                                    <h3 className={styles.panelTitle}>Source Composer</h3>
                                    <span className={styles.statusBadge}>Text + PDF</span>
                                </div>

                                <div className={styles.fieldGroup}>
                                    <label className={styles.fieldLabel}>Instructor intent / text source</label>
                                    <textarea
                                        className={styles.textArea}
                                        rows={8}
                                        placeholder="Paste course notes, describe what the questions should test, or add style and difficulty instructions."
                                        value={sourceText}
                                        onChange={(event) => setSourceText(event.target.value)}
                                    />
                                    <p className={styles.helperText}>
                                        If you also upload a PDF, this text becomes supplemental intent instead of replacing the document source.
                                    </p>
                                </div>

                                <div className={styles.fieldGroup}>
                                    <label className={styles.fieldLabel}>PDF upload</label>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="application/pdf"
                                        style={{ display: 'none' }}
                                        onChange={(event) => {
                                            const file = event.target.files?.[0];
                                            if (file) void handleUploadedFile(file);
                                        }}
                                    />
                                    <div
                                        className={[styles.uploadDropzone, dragActive ? styles.uploadDropzoneActive : ''].filter(Boolean).join(' ')}
                                        onDragOver={(event) => {
                                            event.preventDefault();
                                            setDragActive(true);
                                        }}
                                        onDragLeave={() => setDragActive(false)}
                                        onDrop={(event) => {
                                            event.preventDefault();
                                            setDragActive(false);
                                            const file = event.dataTransfer.files?.[0];
                                            if (file) void handleUploadedFile(file);
                                        }}
                                    >
                                        <div className={styles.panelTitleRow}>
                                            <div>
                                                <p className={styles.panelTitle}>Upload one PDF</p>
                                                <p className={styles.helperText}>Drop a PDF here or choose one from disk.</p>
                                            </div>
                                            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                                                {uploading ? <LoaderCircle size={16} className={styles.spinner} /> : <FileUp size={16} />}
                                                {uploading ? 'Uploading...' : 'Choose PDF'}
                                            </Button>
                                        </div>
                                        {selectedFile ? (
                                            <div className={styles.uploadMeta}>
                                                <span className={styles.metaPill}>{selectedFile.name}</span>
                                                <span className={styles.metaPill}>Connected</span>
                                            </div>
                                        ) : (
                                            <p className={styles.helperText}>No PDF connected yet.</p>
                                        )}
                                    </div>
                                </div>

                                <div className={styles.actionRow}>
                                    <Button type="button" variant="outline" onClick={() => setWorkspaceStep('start')}>
                                        <ArrowLeft size={16} /> Back
                                    </Button>
                                    <Button type="button" onClick={() => void handleGenerate()} disabled={isGenerating || providerLoading || !provider}>
                                        <Sparkles size={16} /> Generate Questions
                                    </Button>
                                </div>
                            </div>

                            <aside className={styles.providerRail}>
                                <div className={styles.panel}>
                                    <div className={styles.panelTitleRow}>
                                        <h3 className={styles.panelTitle}>Generation Settings</h3>
                                        <span className={styles.statusBadge}>AI Config</span>
                                    </div>

                                    <div className={styles.fieldGroup}>
                                        <label className={styles.fieldLabel}>Question Type</label>
                                        <select className={styles.selectInput} value={questionType} onChange={(event) => setQuestionType(event.target.value)}>
                                            <option>Multiple choice</option>
                                            <option>Short answer</option>
                                            <option>Fill in the blank</option>
                                            <option>Essay</option>
                                        </select>
                                    </div>

                                    <div className={styles.fieldGroup}>
                                        <label className={styles.fieldLabel}>Question Count</label>
                                        <input className={styles.textInput} type="number" min={1} max={30} value={numQuestions} onChange={(event) => setNumQuestions(Number(event.target.value) || 1)} />
                                    </div>

                                    <div className={styles.fieldGroup}>
                                        <label className={styles.fieldLabel}>Difficulty (1-5)</label>
                                        <input className={styles.textInput} type="number" min={1} max={5} value={difficulty} onChange={(event) => setDifficulty(Number(event.target.value) || 1)} />
                                    </div>

                                    <div className={styles.fieldGroup}>
                                        <label className={styles.fieldLabel}>Output Language</label>
                                        <input className={styles.textInput} value={outputLanguage} onChange={(event) => setOutputLanguage(event.target.value)} />
                                    </div>

                                    <div className={styles.fieldGroup}>
                                        <label className={styles.fieldLabel}>Additional Constraints</label>
                                        <textarea
                                            className={styles.textArea}
                                            rows={5}
                                            placeholder="One instruction per line."
                                            value={constraints}
                                            onChange={(event) => setConstraints(event.target.value)}
                                        />
                                    </div>

                                    <div className={styles.fieldGroup}>
                                        <label className={styles.fieldLabel}>Text Provider</label>
                                        {providerLoading ? (
                                            <div className={styles.emptyState}>Loading provider options...</div>
                                        ) : providerOptions.length === 0 ? (
                                            <div className={styles.emptyState}>No configured text provider found in AI Config.</div>
                                        ) : (
                                            <div className={styles.providerList}>
                                                {providerOptions.map((option) => (
                                                    <button
                                                        key={option}
                                                        type="button"
                                                        className={[styles.providerOption, provider === option ? styles.providerOptionActive : ''].filter(Boolean).join(' ')}
                                                        onClick={() => setProvider(option)}
                                                    >
                                                        <span className={styles.providerName}>{PROVIDER_LABELS[option]}</span>
                                                        <span className={styles.helperText}>Connected through your profile AI configuration.</span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </aside>
                        </div>
                    </section>
                )}

                {view === 'generate' && workspaceStep === 'result' && (
                    <section className={styles.resultLayout}>
                        <div className={styles.statusCard}>
                            <div className={styles.statusRow}>
                                <div>
                                    <span className={styles.statusBadge}>Streaming Result</span>
                                    <h3 className={styles.panelTitle} style={{ marginTop: 10 }}>Question generation workspace</h3>
                                </div>
                                <div className={styles.selectionSummary}>
                                    <span className={styles.metaPill}>{questions.length} generated</span>
                                    <span className={styles.metaPill}>{selectedQuestions.length} selected</span>
                                    {provider ? <span className={styles.metaPill}>{PROVIDER_LABELS[provider]}</span> : null}
                                </div>
                            </div>
                            <p className={styles.statusMessage}>
                                {isGenerating ? streamMessage : streamMessage}
                            </p>
                            <div className={styles.footerActions}>
                                <Button type="button" variant="outline" onClick={() => setWorkspaceStep('composer')} disabled={isGenerating}>
                                    <PencilLine size={16} /> Back to Composer
                                </Button>
                                <Button type="button" variant="outline" onClick={() => void handleSaveHistory()} disabled={!historyId || isSavingHistory}>
                                    {isSavingHistory ? <LoaderCircle size={16} className={styles.spinner} /> : <History size={16} />}
                                    Save to History
                                </Button>
                                <Button type="button" variant="outline" onClick={() => void handleExport('markdown')} disabled={selectedQuestions.length === 0}>
                                    <FileText size={16} /> Export Markdown
                                </Button>
                                <Button type="button" variant="outline" onClick={() => void handleExport('txt')} disabled={selectedQuestions.length === 0}>
                                    <ScrollText size={16} /> Export TXT
                                </Button>
                                <Button type="button" onClick={() => void handleExport('pdf')} disabled={selectedQuestions.length === 0}>
                                    <Download size={16} /> Export PDF
                                </Button>
                            </div>
                        </div>

                        {questions.length === 0 ? (
                            <div className={styles.emptyState}>
                                {isGenerating ? 'Waiting for structured questions to stream in...' : 'No questions available yet.'}
                            </div>
                        ) : (
                            <div className={styles.questionList}>
                                {questions.map((question, index) => (
                                    <QuestionCard
                                        key={question.id}
                                        index={index}
                                        question={question}
                                        selected={selectedQuestionIds.includes(question.id)}
                                        onToggle={() => toggleSelectedQuestion(question.id)}
                                        onChange={(field, value, optionIndex) => updateQuestion(question.id, field, value, optionIndex)}
                                        onAddOption={() => addOption(question.id)}
                                        onRemoveOption={(optionIndex) => removeOption(question.id, optionIndex)}
                                    />
                                ))}
                            </div>
                        )}
                    </section>
                )}
            </PptGeneratorShell>
            <ToastContainer toasts={toasts} onDismiss={removeToast} />
        </>
    );
}
