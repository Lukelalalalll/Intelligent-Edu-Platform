import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import styles from './styles/sub5.module.css';

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
    notes, flashcards, isLoading, loadingText, activeTab, setActiveTab,
}) {
    return (
        <div className={styles.resultsContainer}>
            {/* Tabs */}
            {(notes || flashcards.length > 0) && (
                <div className={styles.tabBar}>
                    <button
                        className={`${styles.tab} ${activeTab === 'notes' ? styles.tabActive : ''}`}
                        onClick={() => setActiveTab('notes')}
                    >
                        <i className="fas fa-sticky-note"></i> Study Notes
                    </button>
                    <button
                        className={`${styles.tab} ${activeTab === 'flashcards' ? styles.tabActive : ''}`}
                        onClick={() => setActiveTab('flashcards')}
                    >
                        <i className="fas fa-clone"></i> Flashcards ({flashcards.length})
                    </button>
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

                    {/* Empty state */}
                    {!notes && flashcards.length === 0 && (
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
