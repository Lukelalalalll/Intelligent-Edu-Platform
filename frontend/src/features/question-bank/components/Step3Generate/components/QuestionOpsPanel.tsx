import React from 'react';
import styles from '../../../styles/questionBank.module.css';
import type { QuestionOpsPanelProps } from '../types';

export default function QuestionOpsPanel({
    generatedQuestions,
    rawExtractText,
    questionOpsSummary,
    questionOpsItems,
    questionOpsLoading,
    questionOpsError,
    questionOpsThreshold,
    questionOpsSort,
    questionOpsDuplicatesOnly,
    questionOpsTagFilter,
    questionOpsDedupeResult,
    questionOpsDedupeLoading,
    setQuestionOpsThreshold,
    setQuestionOpsSort,
    setQuestionOpsDuplicatesOnly,
    setQuestionOpsTagFilter,
    runQuestionOps,
    applyQuestionOpsDedupe,
}: QuestionOpsPanelProps) {
    const allTags = Array.from(
        new Set((questionOpsItems || []).flatMap((item) => (item.coverage_tags || []).map((tag) => String(tag))))
    );

    const filteredItems = (questionOpsItems || [])
        .filter((item) => (questionOpsDuplicatesOnly ? item.is_duplicate : true))
        .filter((item) => (questionOpsTagFilter === 'all' ? true : (item.coverage_tags || []).includes(questionOpsTagFilter)))
        .sort((a, b) => {
            const qa = Number(a.quality_score || 0);
            const qb = Number(b.quality_score || 0);
            return questionOpsSort === 'quality_asc' ? qa - qb : qb - qa;
        });

    return (
        <details className={styles.questionOpsPanel} open>
            <summary className={styles.questionOpsSummary}>QuestionOps</summary>

            <div className={styles.questionOpsActions}>
                <button
                    className={`${styles.btn} ${styles.btnPrimary}`}
                    onClick={runQuestionOps}
                    disabled={questionOpsLoading || (!generatedQuestions && !rawExtractText)}
                >
                    {questionOpsLoading
                        ? <><i className="fas fa-spinner fa-spin"></i> Running Analysis...</>
                        : <><i className="fas fa-chart-line"></i> Run Analysis</>}
                </button>

                <div className={styles.questionOpsControlGroup}>
                    <label htmlFor="questionOpsThreshold">Threshold</label>
                    <input
                        id="questionOpsThreshold"
                        className={styles.formControl}
                        value={questionOpsThreshold}
                        onChange={(e) => setQuestionOpsThreshold(e.target.value)}
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                    />
                </div>

                <button
                    className={`${styles.btn} ${styles.btnWarning}`}
                    onClick={applyQuestionOpsDedupe}
                    disabled={!questionOpsItems.length || questionOpsDedupeLoading || questionOpsLoading}
                >
                    {questionOpsDedupeLoading
                        ? <><i className="fas fa-spinner fa-spin"></i> Applying...</>
                        : <><i className="fas fa-filter"></i> Apply Dedupe</>}
                </button>
            </div>

            {questionOpsSummary && (
                <div className={styles.questionOpsStats}>
                    <div className={styles.questionOpsStatCard}>
                        <span>Count</span>
                        <strong>{questionOpsSummary.question_count || 0}</strong>
                    </div>
                    <div className={styles.questionOpsStatCard}>
                        <span>Avg Quality</span>
                        <strong>{(questionOpsSummary.avg_quality_score || 0).toFixed(3)}</strong>
                    </div>
                    <div className={styles.questionOpsStatCard}>
                        <span>Duplicates</span>
                        <strong>{questionOpsSummary.duplicate_count || 0}</strong>
                    </div>
                </div>
            )}

            {questionOpsDedupeResult && (
                <div className={styles.infoBox}>
                    Kept: <strong>{questionOpsDedupeResult.kept}</strong> | Removed: <strong>{questionOpsDedupeResult.removed}</strong>
                </div>
            )}

            {questionOpsError && (
                <div className={styles.questionOpsError}>{questionOpsError}</div>
            )}

            {!!questionOpsItems.length && (
                <>
                    <div className={styles.questionOpsFilters}>
                        <div className={styles.questionOpsControlGroup}>
                            <label htmlFor="questionOpsSort">Sort</label>
                            <select
                                id="questionOpsSort"
                                className={styles.formControl}
                                value={questionOpsSort}
                                onChange={(e) => setQuestionOpsSort(e.target.value as QuestionOpsPanelProps['questionOpsSort'])}
                            >
                                <option value="quality_desc">Quality High to Low</option>
                                <option value="quality_asc">Quality Low to High</option>
                            </select>
                        </div>

                        <label className={styles.extractToolbarCheckbox}>
                            <input
                                type="checkbox"
                                checked={questionOpsDuplicatesOnly}
                                onChange={(e) => setQuestionOpsDuplicatesOnly(e.target.checked)}
                            />
                            <span>Only Duplicates</span>
                        </label>

                        <div className={styles.questionOpsTags}>
                            <button
                                className={`${styles.tagBtn} ${questionOpsTagFilter === 'all' ? styles.tagBtnActive : ''}`}
                                onClick={() => setQuestionOpsTagFilter('all')}
                            >
                                All
                            </button>
                            {allTags.map((tag) => (
                                <button
                                    key={tag}
                                    className={`${styles.tagBtn} ${questionOpsTagFilter === tag ? styles.tagBtnActive : ''}`}
                                    onClick={() => setQuestionOpsTagFilter(tag)}
                                >
                                    {tag}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className={styles.questionOpsList}>
                        {filteredItems.map((item) => (
                            <div key={item.item_id} className={styles.questionOpsItem}>
                                <div className={styles.questionOpsTopLine}>
                                    <div className={styles.questionOpsQuality}>Quality: {Number(item.quality_score || 0).toFixed(3)}</div>
                                    <div className={styles.questionOpsBadges}>
                                        <span className={`${styles.opsBadge} ${item.is_duplicate ? styles.opsBadgeDup : styles.opsBadgeKeep}`}>
                                            {item.is_duplicate ? 'Duplicate' : 'Unique'}
                                        </span>
                                        <span className={styles.opsBadge}>{item.difficulty_estimate}</span>
                                        {item.status && <span className={styles.opsBadge}>{item.status}</span>}
                                    </div>
                                </div>
                                <p className={styles.questionOpsQuestion}>{item.question}</p>
                                <div className={styles.questionOpsTagsRow}>
                                    {(item.coverage_tags || []).map((tag) => (
                                        <span key={`${item.item_id}-${tag}`} className={styles.opsTag}>{tag}</span>
                                    ))}
                                </div>
                            </div>
                        ))}
                        {filteredItems.length === 0 && <p className={styles.questionOpsEmpty}>No items match the selected filters.</p>}
                    </div>
                </>
            )}
        </details>
    );
}
