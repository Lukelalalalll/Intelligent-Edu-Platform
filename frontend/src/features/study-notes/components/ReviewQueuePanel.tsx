import React from 'react';
import styles from '../styles/sub5.module.css';
import type { ReviewQueueItem, ReviewRating } from '../../../api/studyNotesPlanApi';

interface ReviewQueuePanelProps {
    item: ReviewQueueItem | null;
    reviewMessage: string;
    reviewLoading: boolean;
    reviewSubmitting: ReviewRating | null;
    onLoadNextReview: () => void;
    onSubmitReview: (rating: ReviewRating) => void;
}

const RATING_OPTIONS: Array<{ value: ReviewRating; label: string; className: string }> = [
    { value: 'again', label: 'Again', className: 'ratingAgain' },
    { value: 'hard', label: 'Hard', className: 'ratingHard' },
    { value: 'good', label: 'Good', className: 'ratingGood' },
    { value: 'easy', label: 'Easy', className: 'ratingEasy' },
];

export default function ReviewQueuePanel({
    item,
    reviewMessage,
    reviewLoading,
    reviewSubmitting,
    onLoadNextReview,
    onSubmitReview,
}: ReviewQueuePanelProps) {
    return (
        <section className={styles.reviewPanel}>
            <div className={styles.reviewHeaderRow}>
                <div>
                    <h4 className={styles.reviewTitle}>Review Queue</h4>
                    <p className={styles.reviewHint}>{reviewMessage}</p>
                </div>
                <button
                    type="button"
                    className={styles.nextReviewBtn}
                    onClick={onLoadNextReview}
                    disabled={reviewLoading}
                >
                    {reviewLoading ? <><i className="fas fa-spinner fa-spin"></i> Loading...</> : <><i className="fas fa-forward"></i> Next Review</>}
                </button>
            </div>

            {item ? (
                <div className={styles.reviewCard}>
                    <div className={styles.reviewMetaRow}>
                        <span><strong>Due:</strong> {new Date(item.due_at).toLocaleString()}</span>
                        <span><strong>Repetitions:</strong> {item.repetitions}</span>
                    </div>
                    <p className={styles.reviewFocus}>{item.focus}</p>

                    <div className={styles.reviewActions}>
                        {RATING_OPTIONS.map((opt) => (
                            <button
                                key={opt.value}
                                type="button"
                                className={`${styles.ratingBtn} ${styles[opt.className]}`}
                                disabled={!!reviewSubmitting}
                                onClick={() => onSubmitReview(opt.value)}
                            >
                                {reviewSubmitting === opt.value ? <><i className="fas fa-spinner fa-spin"></i> Saving...</> : opt.label}
                            </button>
                        ))}
                    </div>
                </div>
            ) : (
                <div className={styles.reviewEmpty}>
                    <i className="fas fa-hourglass-half"></i>
                    <span>No ready item yet.</span>
                </div>
            )}
        </section>
    );
}
