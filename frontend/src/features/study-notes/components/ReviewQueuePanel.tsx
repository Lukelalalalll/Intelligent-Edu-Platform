import React from 'react';
import styles from '../styles/reviewQueue.module.css';
import type { ReviewQueueItem, ReviewRating } from '../api/studyNotesApi';

interface ReviewQueuePanelProps {
    item: ReviewQueueItem | null;
    reviewMessage: string;
    reviewError: string;
    reviewLoading: boolean;
    reviewSubmitting: ReviewRating | null;
    onLoadNextReview: () => void;
    onSubmitReview: (rating: ReviewRating) => void;
}

const RATING_OPTIONS: Array<{ value: ReviewRating; label: string; sublabel: string; className: string }> = [
    { value: 'again', label: 'Again', sublabel: "Didn't remember", className: 'ratingAgain' },
    { value: 'hard', label: 'Hard', sublabel: 'With difficulty', className: 'ratingHard' },
    { value: 'good', label: 'Good', sublabel: 'Remembered well', className: 'ratingGood' },
    { value: 'easy', label: 'Easy', sublabel: 'Very easy', className: 'ratingEasy' },
];

export default function ReviewQueuePanel({
    item,
    reviewMessage,
    reviewError,
    reviewLoading,
    reviewSubmitting,
    onLoadNextReview,
    onSubmitReview,
}: ReviewQueuePanelProps) {
    return (
        <section className={styles.reviewPanel}>
            {/* Header */}
            <div className={styles.reviewHeaderRow}>
                <div>
                    <div className={styles.reviewTitleRow}>
                        <h4 className={styles.reviewTitle}>
                            <i className="fas fa-brain" style={{ marginRight: 8, color: '#0b7a58' }}></i>
                            Spaced Review
                        </h4>
                        <span className={styles.reviewBadge}>SRS</span>
                    </div>
                    <p className={styles.reviewDescription}>
                        Practice recalling topics at increasing intervals — the more you remember, the less often you'll see it.
                    </p>
                </div>
                <button
                    type="button"
                    className={styles.nextReviewBtn}
                    onClick={onLoadNextReview}
                    disabled={reviewLoading || !!reviewSubmitting}
                >
                    {reviewLoading
                        ? <><i className="fas fa-spinner fa-spin"></i> Loading...</>
                        : <><i className="fas fa-forward"></i> Next Review</>}
                </button>
            </div>

            {/* Status message */}
            <p className={styles.reviewHint}>{reviewMessage}</p>

            {/* Inline error */}
            {reviewError && (
                <p className={styles.reviewInlineError}>
                    <i className="fas fa-exclamation-circle" style={{ marginRight: 6 }}></i>
                    {reviewError}
                </p>
            )}

            {/* Review card */}
            {item ? (
                <div className={styles.reviewCard}>
                    <div className={styles.reviewMetaRow}>
                        <span className={styles.reviewMetaBadge}>
                            <i className="fas fa-clock" style={{ marginRight: 4 }}></i>
                            Due: {new Date(item.due_at).toLocaleString()}
                        </span>
                        <span className={styles.reviewMetaBadge}>
                            <i className="fas fa-redo" style={{ marginRight: 4 }}></i>
                            Review #{item.repetitions + 1}
                        </span>
                    </div>

                    <div className={styles.reviewFocusBlock}>
                        <div className={styles.reviewFocusLabel}>Topic to recall:</div>
                        <p className={styles.reviewFocus}>{item.focus}</p>
                    </div>

                    <div className={styles.reviewRatingLabel}>
                        How well did you remember it?
                    </div>
                    <div className={styles.reviewActions}>
                        {RATING_OPTIONS.map((opt) => (
                            <button
                                key={opt.value}
                                type="button"
                                className={`${styles.ratingBtn} ${styles[opt.className]}`}
                                disabled={!!reviewSubmitting}
                                onClick={() => onSubmitReview(opt.value)}
                                title={opt.sublabel}
                            >
                                {reviewSubmitting === opt.value
                                    ? <><i className="fas fa-spinner fa-spin"></i></>
                                    : <>
                                        <span className={styles.ratingLabel}>{opt.label}</span>
                                        <span className={styles.ratingSubLabel}>{opt.sublabel}</span>
                                    </>}
                            </button>
                        ))}
                    </div>
                </div>
            ) : (
                !reviewLoading && (
                    <div className={styles.reviewEmpty}>
                        <i className="fas fa-check-circle" style={{ color: '#0b7a58', fontSize: '1.6rem' }}></i>
                        <span>Click <strong>Next Review</strong> to fetch your next due topic.</span>
                    </div>
                )
            )}
        </section>
    );
}
