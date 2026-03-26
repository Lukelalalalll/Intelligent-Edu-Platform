import React from 'react';
import styles from '../../../../../styles/sub1/highlighter.module.css';

export default function ReaderSection({
    loading, sections, currentSectionIndex, currentSectionTitle,
    isRenderedView, htmlContent, textLength, readTime,
    markdownViewRef, showSection, toggleView, handleMouseUp
}) {
    return (
        <div className={`card ${styles.readerCard}`}>
            <div className={styles.cardHeader}>
                <div className={styles.cardIcon}><i className="fas fa-book-open"></i></div>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Document Reader</h2>
                <div className={`controls ${styles.msAuto}`}>
                    <button className={styles.toggleViewBtn} onClick={toggleView}>
                        {isRenderedView ? 'Switch to Raw' : 'Switch to Rendered'}
                    </button>
                </div>
            </div>

            <div className="card-content">
                <div className="stats-bar">
                    <div className={styles.pagination} style={{ marginBottom: 0, padding: '5px' }}>
                        {sections.map((_, index) => {
                            const isActive = Number(index) === Number(currentSectionIndex);
                            return (
                                <button
                                    key={index}
                                    type="button"
                                    className={`${styles.pageBtn} ${isActive ? styles.pageBtnActive : ''}`}
                                    style={{
                                        backgroundColor: isActive ? 'var(--primary-color)' : '#ffffff',
                                        color: isActive ? '#ffffff' : 'var(--text-sub)',
                                        borderColor: isActive ? 'var(--primary-color)' : 'rgba(0,0,0,0.08)'
                                    }}
                                    onClick={() => showSection(index)}
                                >
                                    {index + 1}
                                </button>
                            );
                        })}
                    </div>
                    <div className="stats-tag"><i className="fas fa-file-alt"></i> {textLength} Characters</div>
                    <div className="stats-tag"><i className="fas fa-clock"></i> ~{readTime} Min Read</div>
                </div>

                <div className={styles.markdownContainer} onMouseUp={handleMouseUp}>
                    {loading ? (
                        <div className={styles.loadingState}><i className="fas fa-spinner fa-spin"></i><p>Loading document...</p></div>
                    ) : isRenderedView ? (
                        <>
                            <h2 style={{ borderBottom: '2px solid rgba(0, 123, 85, 0.2)', paddingBottom: '0.6rem', color: 'var(--primary-dark)', marginBottom: '1.5rem', fontSize: '1.8rem', fontWeight: 800 }}>
                                {currentSectionTitle}
                            </h2>
                            <div ref={markdownViewRef} className="document-content-layer" />
                        </>
                    ) : (
                        <div ref={markdownViewRef} style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', lineHeight: '1.6' }}>
                            {`# ${currentSectionTitle}\n${htmlContent}`}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}