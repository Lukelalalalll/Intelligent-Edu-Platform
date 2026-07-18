import { Download, FileText, History, LoaderCircle, PencilLine, ScrollText } from 'lucide-react';

import Button from '@/shared/components/Button/Button';

import type { QuestionGeneratorController } from '../../hooks/useQuestionGenerator';
import styles from '../../styles/questionStudio.module.css';
import QuestionCard from './QuestionCard';

interface QuestionGeneratorResultStepProps {
    controller: QuestionGeneratorController;
}

export default function QuestionGeneratorResultStep({ controller }: QuestionGeneratorResultStepProps) {
    const { state, derived, actions } = controller;

    return (
        <section className={styles.resultLayout}>
            <div className={styles.statusCard}>
                <div className={styles.statusRow}>
                    <div>
                        <span className={styles.statusBadge}>Streaming Result · {derived.streamPhaseLabel}</span>
                        <h3 className={styles.panelTitle} style={{ marginTop: 10 }}>Question generation workspace</h3>
                    </div>
                    <div className={styles.selectionSummary}>
                        <span className={styles.metaPill}>{state.questions.length} generated</span>
                        <span className={styles.metaPill}>{derived.selectedQuestions.length} selected</span>
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
                    <Button type="button" variant="outline" onClick={() => void actions.handleSaveHistory()} disabled={!state.historyId || state.isSavingHistory}>
                        {state.isSavingHistory ? <LoaderCircle size={16} className={styles.spinner} /> : <History size={16} />}
                        Save to History
                    </Button>
                    <Button type="button" variant="outline" onClick={() => void actions.handleExport('markdown')} disabled={derived.selectedQuestions.length === 0}>
                        <FileText size={16} /> Export Markdown
                    </Button>
                    <Button type="button" variant="outline" onClick={() => void actions.handleExport('txt')} disabled={derived.selectedQuestions.length === 0}>
                        <ScrollText size={16} /> Export TXT
                    </Button>
                    <Button type="button" onClick={() => void actions.handleExport('pdf')} disabled={derived.selectedQuestions.length === 0}>
                        <Download size={16} /> Export PDF
                    </Button>
                </div>
            </div>

            {state.questions.length === 0 ? (
                <div className={styles.emptyState}>
                    {state.isGenerating ? 'Waiting for structured questions to stream in...' : 'No questions available yet.'}
                </div>
            ) : (
                <div className={styles.questionList}>
                    {state.questions.map((question, index) => (
                        <QuestionCard
                            key={question.id}
                            index={index}
                            question={question}
                            selected={state.selectedQuestionIds.includes(question.id)}
                            onToggle={() => actions.toggleSelectedQuestion(question.id)}
                            onChange={(field, value, optionIndex) => actions.updateQuestion(question.id, field, value, optionIndex)}
                            onAddOption={() => actions.addOption(question.id)}
                            onRemoveOption={(optionIndex) => actions.removeOption(question.id, optionIndex)}
                        />
                    ))}
                </div>
            )}
        </section>
    );
}
