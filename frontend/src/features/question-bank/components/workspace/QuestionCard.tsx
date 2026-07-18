import { Plus, Trash2 } from 'lucide-react';

import Button from '@/shared/components/Button/Button';
import type { QuestionDraft } from '@/types/api';

import QuestionMarkdown from '../QuestionMarkdown';
import { buildQuestionMarkdown } from '../../questionDraftUtils';
import styles from '../../styles/questionStudio.module.css';

interface QuestionCardProps {
    index: number;
    question: QuestionDraft;
    selected: boolean;
    onToggle: () => void;
    onChange: (field: keyof QuestionDraft, value: string, optionIndex?: number) => void;
    onAddOption: () => void;
    onRemoveOption: (optionIndex: number) => void;
}

export default function QuestionCard({
    index,
    question,
    selected,
    onToggle,
    onChange,
    onAddOption,
    onRemoveOption,
}: QuestionCardProps) {
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
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            aria-label="Remove option"
                                            onClick={() => onRemoveOption(optionIndex)}
                                        >
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
