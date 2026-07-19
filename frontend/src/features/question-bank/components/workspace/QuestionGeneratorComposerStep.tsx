import { useRef } from 'react';
import { FileUp, LoaderCircle, Sparkles } from 'lucide-react';

import Button from '@/shared/components/Button/Button';

import { HistoryStrip } from '../QuestionStudioCards';
import type { QuestionGeneratorController } from '../../hooks/useQuestionGenerator';
import styles from '../../styles/questionStudio.module.css';

interface QuestionGeneratorComposerStepProps {
    controller: QuestionGeneratorController;
}

export default function QuestionGeneratorComposerStep({ controller }: QuestionGeneratorComposerStepProps) {
    const { state, derived, actions } = controller;
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const activeProviderId = state.provider || derived.preferredAiConfigOptions[0]?.id || '';
    const hasProviderOptions = derived.preferredAiConfigOptions.length > 0;
    const summaryItems = [
        {
            label: 'Text Model',
            value: derived.currentResultModel || derived.selectedProviderStatus?.model || 'No model selected',
        },
        {
            label: 'Questions',
            value: `${state.numQuestions} questions`,
        },
        {
            label: 'Language',
            value: state.outputLanguage || 'English',
        },
        {
            label: 'PDF Scope',
            value: derived.pageScopeSummary,
        },
    ];

    return (
        <section className={styles.workspace}>
            <div className={styles.composerGrid}>
                <div className={styles.panel}>
                    <div className={styles.panelTitleRow}>
                        <h3 className={styles.panelTitle}>Question Source</h3>
                        <span className={styles.statusBadge}>Prompt + PDF</span>
                    </div>

                    <div className={styles.fieldGroup}>
                        <label className={styles.fieldLabel} htmlFor="question-prompt">Prompt</label>
                        <textarea
                            id="question-prompt"
                            className={styles.textArea}
                            rows={10}
                            placeholder="Write the question-making prompt, the teaching goal, tone, and any constraints you want the model to follow."
                            value={state.sourceText}
                            onChange={(event) => actions.setSourceText(event.target.value)}
                        />
                        <p className={styles.helperText}>
                            This prompt is sent as the instruction layer. You can use it alone or combine it with a PDF source.
                        </p>
                    </div>

                    <div className={styles.fieldGroup}>
                        <label className={styles.fieldLabel}>PDF Upload</label>
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

                    {state.selectedFile ? (
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
                    ) : null}
                </div>

                <aside className={styles.providerRail}>
                    <div className={styles.panel}>
                        <div className={styles.panelTitleRow}>
                            <div className={styles.panelTitleStack}>
                                <span className={styles.panelEyebrow}>Current AI Config</span>
                                <h3 className={styles.panelTitle}>AI Model & Settings</h3>
                            </div>
                            <Button type="button" variant="outline" onClick={actions.navigateToAiConfig}>
                                AI Config
                            </Button>
                        </div>

                        <div className={styles.fieldGroup}>
                            <div className={styles.panelTitleRow}>
                                <label className={styles.fieldLabel}>Configured text models</label>
                                <span className={styles.metaPill}>{derived.aiSelectorLabel}</span>
                            </div>

                            {state.providerLoading ? (
                                <div className={styles.emptyState}>Loading AI models...</div>
                            ) : state.providerError ? (
                                <div className={styles.providerNotice}>
                                    <div className={styles.providerMetaRow}>
                                        <span className={styles.providerName}>Model status unavailable</span>
                                        <span className={styles.metaPill}>AI Config</span>
                                    </div>
                                    <p className={styles.helperText}>{state.providerError}</p>
                                </div>
                            ) : !hasProviderOptions ? (
                                <div className={styles.providerNotice}>
                                    <div className={styles.providerMetaRow}>
                                        <span className={styles.providerName}>No ready model</span>
                                        <span className={styles.metaPill}>AI Config</span>
                                    </div>
                                    <p className={styles.helperText}>
                                        No ready AI Config text model is available. Open AI Config and connect one, then come back here.
                                    </p>
                                    <div>
                                        <Button type="button" variant="outline" onClick={actions.navigateToAiConfig}>
                                            AI Config
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className={styles.providerList} aria-label="Configured AI models">
                                    {derived.preferredAiConfigOptions.map((option) => {
                                        const isActive = option.id === activeProviderId;
                                        return (
                                            <button
                                                key={option.id}
                                                type="button"
                                                className={[
                                                    styles.providerOption,
                                                    isActive ? styles.providerOptionActive : '',
                                                    !option.available ? styles.providerOptionDisabled : '',
                                                ].filter(Boolean).join(' ')}
                                                aria-pressed={isActive}
                                                disabled={!option.available}
                                                onClick={() => actions.setProvider(option.id)}
                                            >
                                                <div className={styles.providerCardTop}>
                                                    <div className={styles.providerCardMain}>
                                                        <span className={styles.providerName}>{option.label}</span>
                                                        <span className={styles.providerModel}>{option.model || 'No model name'}</span>
                                                    </div>
                                                    <span
                                                        className={[
                                                            styles.providerStatusPill,
                                                            option.available ? styles.providerStatusPillReady : styles.providerStatusPillMuted,
                                                        ].filter(Boolean).join(' ')}
                                                    >
                                                        {option.available ? 'Configured' : 'Unavailable'}
                                                    </span>
                                                </div>
                                                {isActive ? <span className={styles.providerSelectedMarker}>Selected</span> : null}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className={styles.configSummaryGrid}>
                            {summaryItems.map((item) => (
                                <div key={item.label} className={styles.configSummaryItem}>
                                    <p className={styles.configSummaryLabel}>{item.label}</p>
                                    <p className={styles.configSummaryValue}>{item.value}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className={styles.panel}>
                        <div className={styles.panelTitleRow}>
                            <div className={styles.panelTitleStack}>
                                <span className={styles.panelEyebrow}>Generator</span>
                                <h3 className={styles.panelTitle}>Question Settings</h3>
                            </div>
                            <span className={styles.statusBadge}>Prompt + PDF</span>
                        </div>

                        <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel} htmlFor="question-type">Question Type</label>
                            <select
                                id="question-type"
                                className={styles.selectInput}
                                value={state.questionType}
                                onChange={(event) => actions.setQuestionType(event.target.value)}
                            >
                                <option>Multiple choice</option>
                                <option>Short answer</option>
                                <option>Fill in the blank</option>
                                <option>Essay</option>
                            </select>
                        </div>

                        <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel} htmlFor="question-count">Question Count</label>
                            <input
                                id="question-count"
                                className={styles.textInput}
                                type="number"
                                min={1}
                                max={30}
                                value={state.numQuestions}
                                onChange={(event) => actions.setNumQuestions(Number(event.target.value) || 1)}
                            />
                        </div>

                        <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel} htmlFor="question-difficulty">Difficulty (1-5)</label>
                            <input
                                id="question-difficulty"
                                className={styles.textInput}
                                type="number"
                                min={1}
                                max={5}
                                value={state.difficulty}
                                onChange={(event) => actions.setDifficulty(Number(event.target.value) || 1)}
                            />
                        </div>

                        <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel} htmlFor="output-language">Output Language</label>
                            <input
                                id="output-language"
                                className={styles.textInput}
                                value={state.outputLanguage}
                                onChange={(event) => actions.setOutputLanguage(event.target.value)}
                            />
                        </div>

                        <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel} htmlFor="question-constraints">Additional Constraints</label>
                            <textarea
                                id="question-constraints"
                                className={styles.textArea}
                                rows={6}
                                placeholder="One instruction per line."
                                value={state.constraints}
                                onChange={(event) => actions.setConstraints(event.target.value)}
                            />
                        </div>

                        <div className={styles.actionRow}>
                            <span className={styles.helperText}>
                                {hasProviderOptions
                                    ? 'Model selection stays on the AI Config side of the house.'
                                    : 'Connect a ready AI Config model before generating.'}
                            </span>
                            <Button
                                type="button"
                                onClick={() => void actions.handleGenerate()}
                                disabled={state.isGenerating || !derived.hasGenerationInput || !activeProviderId || !hasProviderOptions}
                            >
                                {state.isGenerating ? <LoaderCircle size={16} className={styles.spinner} /> : <Sparkles size={16} />}
                                Generate Questions
                            </Button>
                        </div>
                    </div>
                </aside>
            </div>

            <HistoryStrip
                items={state.historyState.items}
                loading={state.historyState.loading}
                onOpen={(historyId) => void actions.hydrateHistoryResult(historyId)}
            />
        </section>
    );
}
