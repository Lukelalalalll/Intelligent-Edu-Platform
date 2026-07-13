import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import styles from '../styles/studyNotesContent.module.css';
import ReviewQueuePanel from './ReviewQueuePanel';
import type { ReviewQueueItem, ReviewRating } from '../api/studyNotesApi';

function FlashcardItem({ card }) {
    const [flipped, setFlipped] = useState(false);

    return (
        <div
            className={`${styles.flashcard} ${flipped ? styles.flashcardFlipped : ''}`}
            onClick={() => setFlipped(v => !v)}
        >
            <div className={styles.flashcardLabel}>{flipped ? 'Answer' : 'Question'}</div>
            <div className={styles.flashcardText}>
                {flipped ? card.answer : card.question}
            </div>
            <div className={styles.flipHint}>Click to {flipped ? 'see question' : 'reveal answer'}</div>
        </div>
    );
}

export default function StudyNotes({
    notes,
    flashcards,
    studyPlan,
    isLoading,
    loadingText,
    activeTab,
    setActiveTab,
    reviewQueueItem,
    reviewMessage,
    reviewError,
    reviewLoading,
    reviewSubmitting,
    reviewProgressMap,
    onLoadNextReview,
    onSubmitReview,
}) {
    const now = new Date();
    const start = studyPlan?.created_at ? new Date(studyPlan.created_at) : now;
    const todayOffset = Math.max(0, Math.floor((now.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));

    return (
        <div className={styles.resultsContainer}>
            {/* Tabs */}
            {((notes !== null && notes !== undefined) || flashcards?.length > 0 || studyPlan) && (
                <div className={styles.tabBar}>
                    {(notes !== null && notes !== undefined) && (
                        <button
                            className={`${styles.tab} ${activeTab === 'notes' ? styles.tabActive : ''}`}
                            onClick={() => setActiveTab('notes')}
                        >
                            <i className="fas fa-sticky-note"></i> Study Notes
                        </button>
                    )}
                    {flashcards != null && (
                        <button
                            className={`${styles.tab} ${activeTab === 'flashcards' ? styles.tabActive : ''}`}
                            onClick={() => setActiveTab('flashcards')}
                        >
                            <i className="fas fa-clone"></i> Flashcards ({flashcards.length})
                        </button>
                    )}
                    {studyPlan && (
                        <button
                            className={`${styles.tab} ${activeTab === 'plan' ? styles.tabActive : ''}`}
                            onClick={() => setActiveTab('plan')}
                        >
                            <i className="fas fa-calendar-check"></i> Study Plan
                        </button>
                    )}
                </div>
            )}

            {/* Loading */}
            {isLoading && (
                <div className={styles.loadingState}>
                    <i className="fas fa-spinner fa-spin"></i>
                    <p>{loadingText}</p>
                </div>
            )}

            {!isLoading && (
                <div className={styles.resultsViewport}>
                    {/* Notes Tab */}
                    {activeTab === 'notes' && notes && (
                        <div className={styles.notesCard}>
                            <ReactMarkdown>{notes}</ReactMarkdown>
                        </div>
                    )}

                    {/* Flashcards Tab */}
                    {activeTab === 'flashcards' && (
                        <>
                            {flashcards.length > 0 ? (
                                <div className={styles.flashcardGrid}>
                                    {flashcards.map((card, idx) => (
                                        <FlashcardItem key={idx} card={card} />
                                    ))}
                                </div>
                            ) : (
                                <div className={styles.emptyState}>
                                    <i className="fas fa-clone"></i>
                                    <p>No flashcards yet. Generate notes first, then switch to flashcards.</p>
                                </div>
                            )}
                        </>
                    )}

                    {/* Plan Tab */}
                    {activeTab === 'plan' && (
                        <>
                            {studyPlan ? (
                                <>
                                    <ReviewQueuePanel
                                        item={reviewQueueItem as ReviewQueueItem | null}
                                        reviewMessage={reviewMessage}
                                        reviewError={reviewError ?? ''}
                                        reviewLoading={reviewLoading}
                                        reviewSubmitting={reviewSubmitting as ReviewRating | null}
                                        onLoadNextReview={onLoadNextReview}
                                        onSubmitReview={onSubmitReview}
                                    />
                                    <div className={styles.planCard}>
                                        <h3>{studyPlan.title || 'Study Plan'}</h3>
                                        <p className={styles.planMeta}>
                                            Duration: {studyPlan.duration_days} days | Sessions: {studyPlan.sessions?.length || 0}
                                        </p>
                                        <div className={styles.planGrid}>
                                            {(studyPlan.sessions || []).map((session) => {
                                                const isToday = session.day === todayOffset + 1;
                                                const repetitions = session.queue_id ? (reviewProgressMap?.[session.queue_id] || 0) : 0;
                                                const progress = Math.min(100, repetitions * 25);

                                                return (
                                                    <div key={session.session_id} className={`${styles.planItem} ${isToday ? styles.planItemToday : ''}`}>
                                                        <div className={styles.planDay}>Day {session.day}</div>
                                                        <div className={styles.planFocus}>{session.focus}</div>
                                                        <div className={styles.planTime}>
                                                            {session.reading_minutes}m reading | {session.review_minutes}m review | {session.practice_minutes}m practice
                                                        </div>
                                                        <div className={styles.planProgressRow}>
                                                            <span>{isToday ? 'Today' : 'Progress'}</span>
                                                            <span>{progress}%</span>
                                                        </div>
                                                        <div className={styles.planProgressTrack}>
                                                            <div className={styles.planProgressFill} style={{ width: `${progress}%` }}></div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className={styles.emptyState}>
                                    <i className="fas fa-calendar-check"></i>
                                    <p>No study plan yet. Generate notes first, then create a plan.</p>
                                </div>
                            )}
                        </>
                    )}

                    {/* Empty state */}
                    {!notes && flashcards.length === 0 && !studyPlan && (
                        <div className={styles.emptyState}>
                            <i className="fas fa-book-reader"></i>
                            <p>Upload a PDF and click Generate to create study notes and flashcards.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
