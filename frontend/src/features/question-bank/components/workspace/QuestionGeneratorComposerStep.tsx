import { useRef } from 'react';
import { ArrowLeft, FileUp, LoaderCircle, Sparkles } from 'lucide-react';

import Button from '@/shared/components/Button/Button';

import type { QuestionGeneratorController } from '../../hooks/useQuestionGenerator';
import {
    formatQuestionProviderSource,
    isAiConfigQuestionProvider,
    type QuestionStudioProvider,
} from '../../questionProviderConfig';
import styles from '../../styles/questionStudio.module.css';

interface QuestionGeneratorComposerStepProps {
    controller: QuestionGeneratorController;
}

export default function QuestionGeneratorComposerStep({ controller }: QuestionGeneratorComposerStepProps) {
    const { state, derived, actions } = controller;
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    return (
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
                            value={state.sourceText}
                            onChange={(event) => actions.setSourceText(event.target.value)}
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
                                if (file) void actions.handleUploadedFile(file);
                            }}
                        />
                        <div
                            className={[styles.uploadDropzone, state.dragActive ? styles.uploadDropzoneActive : ''].filter(Boolean).join(' ')}
                            onDragOver={(event) => {
                                event.preventDefault();
                                actions.setDragActive(true);
                            }}
                            onDragLeave={() => actions.setDragActive(false)}
                            onDrop={(event) => {
                                event.preventDefault();
                                actions.setDragActive(false);
                                const file = event.dataTransfer.files?.[0];
                                if (file) void actions.handleUploadedFile(file);
                            }}
                        >
                            <div className={styles.panelTitleRow}>
                                <div>
                                    <p className={styles.panelTitle}>Upload one PDF</p>
                                    <p className={styles.helperText}>Drop a PDF here or choose one from disk.</p>
                                </div>
                                <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={state.uploading}>
                                    {state.uploading ? <LoaderCircle size={16} className={styles.spinner} /> : <FileUp size={16} />}
                                    {state.uploading ? 'Uploading...' : 'Choose PDF'}
                                </Button>
                            </div>
                            {state.selectedFile ? (
                                <div className={styles.uploadMeta}>
                                    <span className={styles.metaPill}>{state.selectedFile.name}</span>
                                    <span className={styles.metaPill}>Connected</span>
                                    {state.totalPages > 0 ? <span className={styles.metaPill}>{state.totalPages} pages</span> : null}
                                </div>
                            ) : (
                                <p className={styles.helperText}>No PDF connected yet.</p>
                            )}
                        </div>
                    </div>

                    {state.selectedFile && (
                        <div className={styles.fieldGroup}>
                            <div className={styles.panelTitleRow}>
                                <label className={styles.fieldLabel}>PDF Page Scope</label>
                                <span className={styles.metaPill}>{derived.pageScopeSummary}</span>
                            </div>
                            <div className={styles.pageModeRow}>
                                <button
                                    type="button"
                                    className={[styles.modeChip, state.useAllPages ? styles.modeChipActive : ''].filter(Boolean).join(' ')}
                                    onClick={() => actions.setUseAllPages(true)}
                                >
                                    All pages
                                </button>
                                <button
                                    type="button"
                                    className={[styles.modeChip, !state.useAllPages ? styles.modeChipActive : ''].filter(Boolean).join(' ')}
                                    onClick={() => actions.setUseAllPages(false)}
                                >
                                    Selected pages
                                </button>
                            </div>
                            {!state.useAllPages ? (
                                <>
                                    <input
                                        className={styles.textInput}
                                        value={state.pageSelectionInput}
                                        onChange={(event) => actions.setPageSelectionInput(event.target.value)}
                                        placeholder="e.g. 1-3, 6, 9"
                                    />
                                    <p className={styles.helperText}>
                                        Choose exact pages or ranges. Page numbers are 1-based.
                                    </p>
                                </>
                            ) : (
                                <p className={styles.helperText}>
                                    The full PDF will be used as source context.
                                </p>
                            )}
                        </div>
                    )}

                    <div className={styles.actionRow}>
                        <Button type="button" variant="outline" onClick={() => actions.setWorkspaceStep('start')}>
                            <ArrowLeft size={16} /> Back
                        </Button>
                        <Button
                            type="button"
                            onClick={() => void actions.handleGenerate()}
                            disabled={state.isGenerating || !derived.hasGenerationInput}
                        >
                            <Sparkles size={16} /> Generate Questions
                        </Button>
                    </div>
                </div>

                <aside className={styles.providerRail}>
                    <div className={styles.panel}>
                        <div className={styles.panelTitleRow}>
                            <h3 className={styles.panelTitle}>Generation Settings</h3>
                            <span className={styles.statusBadge}>Provider Runtime</span>
                        </div>

                        <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>Question Type</label>
                            <select className={styles.selectInput} value={state.questionType} onChange={(event) => actions.setQuestionType(event.target.value)}>
                                <option>Multiple choice</option>
                                <option>Short answer</option>
                                <option>Fill in the blank</option>
                                <option>Essay</option>
                            </select>
                        </div>

                        <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>Question Count</label>
                            <input className={styles.textInput} type="number" min={1} max={30} value={state.numQuestions} onChange={(event) => actions.setNumQuestions(Number(event.target.value) || 1)} />
                        </div>

                        <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>Difficulty (1-5)</label>
                            <input className={styles.textInput} type="number" min={1} max={5} value={state.difficulty} onChange={(event) => actions.setDifficulty(Number(event.target.value) || 1)} />
                        </div>

                        <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>Output Language</label>
                            <input className={styles.textInput} value={state.outputLanguage} onChange={(event) => actions.setOutputLanguage(event.target.value)} />
                        </div>

                        <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel}>Additional Constraints</label>
                            <textarea
                                className={styles.textArea}
                                rows={5}
                                placeholder="One instruction per line."
                                value={state.constraints}
                                onChange={(event) => actions.setConstraints(event.target.value)}
                            />
                        </div>

                        <div className={styles.fieldGroup}>
                            <div className={styles.panelTitleRow}>
                                <label className={styles.fieldLabel}>{derived.aiSelectorLabel}</label>
                                <Button type="button" variant="outline" onClick={actions.navigateToAiConfig}>
                                    AI Config
                                </Button>
                            </div>
                            {state.providerLoading ? (
                                <div className={styles.emptyState}>Loading AI models...</div>
                            ) : state.providerError ? (
                                <div className={styles.emptyState}>{state.providerError}</div>
                            ) : derived.preferredProviderOptions.length === 0 ? (
                                <div className={styles.emptyState}>
                                    No available AI model is ready right now. Check your AI Config or runtime deployment.
                                </div>
                            ) : (
                                <>
                                    <select
                                        className={styles.selectInput}
                                        value={state.provider || derived.preferredProviderOptions[0]?.id || ''}
                                        onChange={(event) => actions.setProvider(event.target.value as QuestionStudioProvider)}
                                    >
                                        {derived.preferredAiConfigOptions.length > 0 ? (
                                            <optgroup label="AI Config Models">
                                                {derived.preferredAiConfigOptions.map((option) => (
                                                    <option key={option.id} value={option.id}>
                                                        {option.label} · {option.model}
                                                    </option>
                                                ))}
                                            </optgroup>
                                        ) : null}
                                        {derived.preferredProviderOptions.filter((option) => !isAiConfigQuestionProvider(option)).length > 0 ? (
                                            <optgroup label={derived.preferredAiConfigOptions.length > 0 ? 'Other Available Runtimes' : 'Available Runtimes'}>
                                                {derived.preferredProviderOptions
                                                    .filter((option) => !isAiConfigQuestionProvider(option))
                                                    .map((option) => (
                                                        <option key={option.id} value={option.id}>
                                                            {option.label}{option.model ? ` · ${option.model}` : ''}
                                                        </option>
                                                    ))}
                                            </optgroup>
                                        ) : null}
                                    </select>
                                    {derived.selectedProviderStatus ? (
                                        <div className={styles.selectorInfo}>
                                            <div className={styles.providerMetaRow}>
                                                <span className={styles.providerName}>{derived.selectedProviderStatus.label}</span>
                                                <span className={styles.metaPill}>
                                                    {formatQuestionProviderSource(derived.selectedProviderStatus.source)}
                                                </span>
                                            </div>
                                            <span className={styles.helperText}>
                                                {derived.selectedProviderStatus.model ? derived.selectedProviderStatus.model : 'No model information'}
                                            </span>
                                            <span className={styles.helperText}>
                                                {derived.selectedProviderStatus.message}
                                            </span>
                                        </div>
                                    ) : null}
                                    <p className={styles.helperText}>
                                        {derived.preferredAiConfigOptions.length > 0
                                            ? 'This selector prefers healthy models from your AI Config.'
                                            : 'No healthy AI Config model is available, so the selector falls back to available runtimes.'}
                                    </p>
                                </>
                            )}
                        </div>
                    </div>
                </aside>
            </div>
        </section>
    );
}
