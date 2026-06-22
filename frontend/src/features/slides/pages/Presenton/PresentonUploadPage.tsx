import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { aiConfigApi, type AIConfigResponse } from '@/features/ai-config/api/aiConfigApi';
import PptGeneratorShell from '../../components/PptGeneratorShell';
import { slidesGenerationApi } from '../../api/slidesApi';
import { useMdProcessorTextInput } from '../MdProcessor/hooks/useMdProcessorTextInput';
import { useMdProcessorUpload } from '../MdProcessor/hooks/useMdProcessorUpload';
import {
    clearPresentonDrafts,
    savePresentonOutlineDraft,
    savePresentonSourceDraft,
    type PresentonSourceMeta,
} from './presentonState';
import { buildPresentonAiSummary } from './presentonAiSummary';
import { getPresentonStepIndex, getPresentonSteps } from './presentonConstants';
import styles from './presenton.module.css';

export default function PresentonUploadPage() {
    const navigate = useNavigate();
    const upload = useMdProcessorUpload();
    const textInput = useMdProcessorTextInput();

    const [totalPages, setTotalPages] = useState(8);
    const [outlineLoading, setOutlineLoading] = useState(false);
    const [outlineError, setOutlineError] = useState('');
    const [configLoading, setConfigLoading] = useState(true);
    const [configError, setConfigError] = useState('');
    const [aiConfig, setAiConfig] = useState<AIConfigResponse | null>(null);

    useEffect(() => {
        clearPresentonDrafts();
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const config = await aiConfigApi.get();
                if (!cancelled) {
                    setAiConfig(config);
                    setConfigError('');
                }
            } catch (error: any) {
                if (!cancelled) {
                    setConfigError(error?.response?.data?.detail || error?.message || 'Failed to load AI config');
                }
            } finally {
                if (!cancelled) {
                    setConfigLoading(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    const mode = textInput.inputMode;
    const displayFilename = upload.file?.name || upload.currentDisplayFilename || upload.currentFilename;
    const canContinueWithUpload = Boolean(upload.file || upload.currentFilename);
    const canBuildOutlineFromText = Boolean(textInput.textContent.trim());
    const estimatedPages = useMemo(() => {
        if (mode === 'file' && upload.headers.length > 0) {
            return Math.max(upload.headers.length, 1);
        }
        if (mode === 'text' && textInput.textContent.trim()) {
            const blocks = textInput.textContent.split(/\n\s*\n/).filter((item) => item.trim());
            return Math.max(Math.min(blocks.length || 8, 20), 1);
        }
        return 8;
    }, [mode, upload.headers.length, textInput.textContent]);

    useEffect(() => {
        setTotalPages((prev) => {
            if (prev > 0) return prev;
            return estimatedPages;
        });
    }, [estimatedPages]);

    const aiSummary = useMemo(() => buildPresentonAiSummary(aiConfig), [aiConfig]);

    const buildSourceMetaFromText = async (): Promise<PresentonSourceMeta | null> => {
        const result = await textInput.processTextInline();
        if (!result) return null;
        return {
            kind: 'text',
            sourceFilename: '',
            sourceDisplayName: result.title,
            combinedFilename: result.filename,
            presentationTitle: result.title || 'Generated Presentation',
            markdownContent: result.content,
        };
    };

    const ensureUploadParsed = async () => {
        if (upload.currentFilename) {
            return true;
        }
        if (!upload.file) {
            upload.setErrorMsg('Please choose a file first.');
            return false;
        }
        await upload.processFile(upload.file);
        return Boolean(upload.currentFilename || localStorage.getItem('currentFilename'));
    };

    const goToDocumentsPreview = async () => {
        setOutlineError('');
        const parsed = await ensureUploadParsed();
        if (!parsed) return;

        const resolvedFilename = upload.currentFilename || localStorage.getItem('currentFilename') || '';
        const resolvedDisplayName = displayFilename || localStorage.getItem('currentDisplayFilename') || resolvedFilename;
        const source: PresentonSourceMeta = {
            kind: 'upload',
            sourceFilename: resolvedFilename,
            sourceDisplayName: resolvedDisplayName,
            combinedFilename: localStorage.getItem('combinedFilename') || '',
            presentationTitle: resolvedDisplayName.replace(/\.[^/.]+$/, '') || 'Generated Presentation',
            markdownContent: '',
            headerCount: upload.headers.length,
        };

        savePresentonSourceDraft({
            source,
            provider: aiSummary.preferredProvider,
            providerLabel: aiSummary.label,
            providerModel: aiSummary.model,
            aiSummary: aiSummary.summary,
            headers: upload.headers,
            selectedIndices: upload.selectedIndices,
            useLLM: upload.useLLM,
            headerLlmProvider: upload.headerLlmProvider,
        });
        navigate('/slides/presenton/documents-preview');
    };

    const buildOutlineFromText = async () => {
        setOutlineLoading(true);
        setOutlineError('');
        try {
            const source = await buildSourceMetaFromText();
            if (!source) return;

            const outline = await slidesGenerationApi.generatePresentonOutline({
                provider: aiSummary.preferredProvider,
                content: source.markdownContent,
                total_pages: Math.max(1, totalPages || estimatedPages),
                presentation_title: source.presentationTitle,
                source_kind: source.kind,
                source_filename: source.sourceFilename,
                source_display_name: source.sourceDisplayName,
                combined_markdown_filename: source.combinedFilename,
            });

            savePresentonOutlineDraft({
                source,
                provider: aiSummary.preferredProvider,
                providerResolved: outline.provider_resolved,
                providerSource: outline.provider_source,
                providerModel: outline.provider_model,
                totalPages: Math.max(1, totalPages || estimatedPages),
                slides: outline.slides,
                selectedTheme: undefined,
                selectedThemeMeta: null,
            });
            navigate('/slides/presenton/outline');
        } catch (error: any) {
            setOutlineError(error?.response?.data?.detail || error?.message || 'Failed to build outline');
        } finally {
            setOutlineLoading(false);
        }
    };

    const canContinue = mode === 'file' ? canContinueWithUpload : canBuildOutlineFromText;
    const primaryLabel = mode === 'file' ? 'Continue to Documents Preview' : 'Generate Outline';
    const handlePrimaryAction = mode === 'file' ? goToDocumentsPreview : buildOutlineFromText;

    return (
        <PptGeneratorShell
            currentStep={getPresentonStepIndex('upload')}
            steps={getPresentonSteps()}
            className="container"
            contentClassName={styles.page}
            toolbar={(
                <div className={styles.toolbar}>
                    <div className={styles.toolbarTitle}>
                        <strong>Presenton Upload</strong>
                        <span>Start with a prompt or supporting documents, then move into the same four-step Presenton flow.</span>
                    </div>
                </div>
            )}
        >
            <div className={styles.entryGrid}>
                <section className={styles.leftCard}>
                    <div className={styles.cardHeader}>
                        <h2>Source Input</h2>
                        <p>Upload course materials or paste the core prompt and notes for the presentation.</p>
                    </div>

                    <div className={styles.modeTabs}>
                        <button
                            type="button"
                            className={`${styles.modeTab} ${mode === 'file' ? styles.modeTabActive : ''}`}
                            onClick={() => textInput.setInputMode('file')}
                        >
                            Upload Documents
                        </button>
                        <button
                            type="button"
                            className={`${styles.modeTab} ${mode === 'text' ? styles.modeTabActive : ''}`}
                            onClick={() => textInput.setInputMode('text')}
                        >
                            Prompt Only
                        </button>
                    </div>

                    {mode === 'file' ? (
                        <div className={styles.fieldStack} style={{ marginTop: 16 }}>
                            <div className={styles.uploadCard}>
                                <label
                                    className={`${styles.uploadDrop} ${upload.isDragging ? styles.uploadDropActive : ''}`}
                                    onDragOver={upload.handleDragOver}
                                    onDragEnter={upload.handleDragOver}
                                    onDragLeave={upload.handleDragLeave}
                                    onDrop={upload.handleDrop}
                                >
                                    <input
                                        ref={upload.fileInputRef}
                                        type="file"
                                        accept=".pdf,.md"
                                        onChange={upload.onFileChange}
                                        style={{ display: 'none' }}
                                    />
                                    <i className="fas fa-cloud-upload-alt" aria-hidden="true" style={{ fontSize: 28, color: '#2563eb' }} />
                                    <strong>{displayFilename || 'Drag a PDF or Markdown file here, or click to browse'}</strong>
                                    <span className={styles.hint}>We keep the original source and parsed markdown in the current project workspace.</span>
                                </label>
                                {(upload.file || upload.currentFilename) && (
                                    <div className={styles.uploadMeta}>
                                        <span className={styles.metaLine}>
                                            Source file: <strong>{displayFilename || upload.currentFilename}</strong>
                                        </span>
                                        <div className={styles.toolbarActions}>
                                            <button
                                                type="button"
                                                className={styles.buttonSecondary}
                                                onClick={() => {
                                                    if (upload.file) {
                                                        void upload.processFile(upload.file);
                                                    }
                                                }}
                                                disabled={!upload.file || upload.uploadStatus === 'start' || upload.loading}
                                            >
                                                <i className={`fas ${upload.loading ? 'fa-spinner fa-spin' : 'fa-cogs'}`} aria-hidden="true" /> {upload.currentFilename ? 'Re-parse File' : 'Parse File'}
                                            </button>
                                            <button type="button" className={styles.buttonGhost} onClick={upload.clearFile}>
                                                <i className="fas fa-times" aria-hidden="true" /> Clear
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className={styles.fieldInline}>
                                <label>
                                    Target Slides
                                    <input
                                        type="number"
                                        min={1}
                                        max={40}
                                        value={totalPages}
                                        onChange={(event) => setTotalPages(Number(event.target.value) || 1)}
                                    />
                                </label>
                                <label>
                                    Header Parsing
                                    <select
                                        value={upload.useLLM ? upload.headerLlmProvider : 'none'}
                                        onChange={(event) => {
                                            if (event.target.value === 'none') {
                                                upload.setUseLLM(false);
                                                return;
                                            }
                                            upload.setUseLLM(true);
                                            upload.setHeaderLlmProvider(event.target.value as 'local_ollama' | 'coze' | 'deepseek');
                                        }}
                                    >
                                        <option value="none">Standard parsing</option>
                                        <option value="local_ollama">Enhanced parsing - Local Ollama</option>
                                        <option value="deepseek">Enhanced parsing - DeepSeek</option>
                                        <option value="coze">Enhanced parsing - Coze</option>
                                    </select>
                                </label>
                            </div>

                            {(upload.currentFilename || upload.file) && (
                                <div className={styles.note}>
                                    {upload.headers.length > 0
                                        ? `Detected ${upload.headers.length} document sections. You can review the parsed content before generating the outline.`
                                        : 'The full document will be used as the source of truth if no section headers are extracted.'}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className={styles.fieldStack} style={{ marginTop: 16 }}>
                            <div className={styles.fieldInline}>
                                <label>
                                    Presentation Title
                                    <input
                                        type="text"
                                        value={textInput.textTitle}
                                        onChange={(event) => textInput.setTextTitle(event.target.value)}
                                        placeholder="Deck title"
                                    />
                                </label>
                                <label>
                                    Target Slides
                                    <input
                                        type="number"
                                        min={1}
                                        max={40}
                                        value={totalPages}
                                        onChange={(event) => setTotalPages(Number(event.target.value) || 1)}
                                    />
                                </label>
                            </div>
                            <label>
                                Seed Notes
                                <textarea
                                    value={textInput.seedContent}
                                    onChange={(event) => textInput.setSeedContent(event.target.value)}
                                    placeholder="Paste rough notes, learning goals, or a prompt to draft the source markdown."
                                />
                            </label>
                            <div className={styles.toolbarActions}>
                                <button
                                    type="button"
                                    className={styles.buttonSecondary}
                                    onClick={textInput.handleCozeGenerate}
                                    disabled={textInput.cozeLoading || !textInput.seedContent.trim()}
                                >
                                    <i className={`fas ${textInput.cozeLoading ? 'fa-spinner fa-spin' : 'fa-magic'}`} aria-hidden="true" /> Draft Markdown
                                </button>
                            </div>
                            <label>
                                Markdown Source
                                <textarea
                                    value={textInput.textContent}
                                    onChange={(event) => textInput.setTextContent(event.target.value)}
                                    placeholder="## Introduction&#10;- Key point&#10;&#10;## Main Idea&#10;- Key point"
                                />
                            </label>
                            {textInput.cozeError && <div className={styles.error}>{textInput.cozeError}</div>}
                        </div>
                    )}

                    {(upload.errorMsg || textInput.processError || outlineError) && (
                        <div className={styles.error} style={{ marginTop: 16 }}>
                            {upload.errorMsg || textInput.processError || outlineError}
                        </div>
                    )}
                </section>

                <aside className={styles.summaryCard}>
                    <div className={styles.summaryHeader}>
                        <h3>Current AI Setup</h3>
                        <p>Presenton now uses this project&apos;s saved AI config directly. No extra Presenton AI settings are required.</p>
                    </div>
                    <div className={styles.summaryGrid}>
                        <strong>
                            Provider
                            <span>{configLoading ? 'Loading...' : aiSummary.label}</span>
                        </strong>
                        <strong>
                            Estimated Slides
                            <span>{Math.max(totalPages || 0, estimatedPages)}</span>
                        </strong>
                    </div>
                    <div className={styles.note}>
                        {configLoading ? 'Loading current AI config...' : (configError || aiSummary.summary)}
                    </div>
                    <div className={styles.summaryActions}>
                        <button
                            type="button"
                            className={styles.summaryAction}
                            onClick={() => {
                                void handlePrimaryAction();
                            }}
                            disabled={!canContinue || outlineLoading || upload.loading || textInput.textProcessing}
                        >
                            <i className={`fas ${outlineLoading || upload.loading || textInput.textProcessing ? 'fa-spinner fa-spin' : 'fa-arrow-right'}`} aria-hidden="true" /> {primaryLabel}
                        </button>
                    </div>
                    <div className={styles.statusCard}>
                        <div className={styles.statusRow}>
                            <strong>Flow</strong>
                            <span>{mode === 'file' ? 'Upload > Preview > Outline > Presentation' : 'Prompt > Outline > Presentation'}</span>
                        </div>
                        <div className={styles.statusRow}>
                            <strong>Current source</strong>
                            <span>{displayFilename || textInput.textTitle || 'Not ready yet'}</span>
                        </div>
                        <div className={styles.statusRow}>
                            <strong>Detected sections</strong>
                            <span>{upload.headers.length ? `${upload.headers.length}` : 'Full source mode'}</span>
                        </div>
                    </div>
                </aside>
            </div>
        </PptGeneratorShell>
    );
}
