import { Download, FileText, History, LoaderCircle, PencilLine } from 'lucide-react';

import Button from '@/shared/components/Button/Button';

import QuestionMarkdown from '../QuestionMarkdown';
import type { QuestionGeneratorController } from '../../hooks/useQuestionGenerator';
import styles from '../../styles/questionStudio.module.css';

interface QuestionGeneratorResultStepProps {
    controller: QuestionGeneratorController;
}

export default function QuestionGeneratorResultStep({ controller }: QuestionGeneratorResultStepProps) {
    const { state, derived, actions } = controller;
    const hasMarkdown = state.resultMarkdown.trim().length > 0;
    const showEditor = hasMarkdown || state.questions.length > 0 || state.isGenerating;

    return (
        <section className={styles.resultLayout}>
            <div className={styles.statusCard}>
                <div className={styles.statusRow}>
                    <div>
                        <span className={styles.statusBadge}>
                            {state.isGenerating ? `Streaming Result · ${derived.streamPhaseLabel}` : 'Markdown Workspace'}
                        </span>
                        <h3 className={styles.panelTitle} style={{ marginTop: 10 }}>
                            Editable question markdown
                        </h3>
                    </div>
                    <div className={styles.selectionSummary}>
                        <span className={styles.metaPill}>{state.questions.length} parsed block{state.questions.length === 1 ? '' : 's'}</span>
                        <span className={styles.metaPill}>{derived.currentResultLabel}</span>
                        {derived.currentResultModel ? <span className={styles.metaPill}>{derived.currentResultModel}</span> : null}
                        {derived.currentResultSource ? <span className={styles.metaPill}>{derived.currentResultSource}</span> : null}
                    </div>
                </div>
                <p className={styles.statusMessage}>{state.streamMessage}</p>
                <div className={styles.footerActions}>
                    <Button type="button" variant="outline" onClick={() => actions.setWorkspaceStep('composer')} disabled={state.isGenerating}>
                        <PencilLine size={16} /> Back to Composer
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => void actions.handleSaveHistory()}
                        disabled={!state.historyId || state.isSavingHistory || !hasMarkdown}
                    >
                        {state.isSavingHistory ? <LoaderCircle size={16} className={styles.spinner} /> : <History size={16} />}
                        Save to History
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => void actions.handleExport('markdown')}
                        disabled={!hasMarkdown}
                    >
                        <FileText size={16} /> Export Markdown
                    </Button>
                    <Button type="button" onClick={() => void actions.handleExport('pdf')} disabled={!hasMarkdown}>
                        <Download size={16} /> Export PDF
                    </Button>
                </div>
            </div>

            <div className={styles.resultGrid}>
                <div className={styles.panel}>
                    <div className={styles.panelTitleRow}>
                        <h4 className={styles.panelTitle}>Markdown</h4>
                        <span className={styles.statusBadge}>{state.isGenerating ? 'Streaming' : 'Editable'}</span>
                    </div>
                    {showEditor ? (
                        <textarea
                            id="question-markdown-editor"
                            className={styles.markdownEditor}
                            value={state.resultMarkdown}
                            onChange={(event) => actions.setResultMarkdown(event.target.value)}
                            readOnly={state.isGenerating}
                            aria-label="Markdown editor"
                            placeholder="The generated question markdown will appear here."
                        />
                    ) : (
                        <div className={styles.emptyState}>
                            {state.isGenerating ? 'Waiting for markdown to stream in...' : 'No markdown source yet.'}
                        </div>
                    )}
                </div>

                <div className={styles.previewPanel}>
                    <div className={styles.panelTitleRow}>
                        <h4 className={styles.panelTitle}>Preview</h4>
                        <span className={styles.statusBadge}>KaTeX Ready</span>
                    </div>
                    {hasMarkdown ? (
                        <QuestionMarkdown markdown={state.resultMarkdown} />
                    ) : (
                        <div className={styles.emptyState}>
                            {state.isGenerating ? 'Waiting for markdown to stream in...' : 'No markdown available yet.'}
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
