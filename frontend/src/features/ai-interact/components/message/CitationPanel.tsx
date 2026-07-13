import React, { useState } from 'react';
import styles from '../../styles/AIMessage.module.css';
import type { RagCitation } from '../../../../types/api';

interface CitationPanelProps {
    citations: RagCitation[];
    isCourseRelevant?: boolean;
}

export default function CitationPanel({ citations, isCourseRelevant }: CitationPanelProps) {
    const [expanded, setExpanded] = useState(false);

    const localCitations = citations.filter((citation) => citation.source_type !== 'web');
    const webCitations = citations.filter((citation) => citation.source_type === 'web');
    const shouldShow = isCourseRelevant || webCitations.length > 0;

    if (!shouldShow) {
        return null;
    }

    const totalCount = (isCourseRelevant ? localCitations.length : 0) + webCitations.length;

    return (
        <div className={styles.citationsWrap}>
            <button className={styles.citationsToggle} onClick={() => setExpanded((value) => !value)}>
                <i className="fas fa-book-open" /> {totalCount} source{totalCount !== 1 ? 's' : ''}
                <i
                    className={`fas fa-chevron-${expanded ? 'up' : 'down'}`}
                    style={{ marginLeft: 4, fontSize: '0.7rem' }}
                />
            </button>

            {expanded && (
                <div className={styles.citationsList}>
                    {isCourseRelevant && localCitations.length > 0 && (
                        <>
                            <div className={styles.citationsGroupHeader}>
                                <i className="fas fa-graduation-cap" /> Course Materials
                            </div>
                            {localCitations.map((citation) => (
                                <div key={citation.index} className={styles.citationCard}>
                                    <div className={styles.citationDoc}>
                                        <i className="fas fa-file-alt" />
                                        <span
                                            className={styles.citationDocName}
                                            title={citation.doc_name || 'Unknown'}
                                        >
                                            {citation.doc_name || 'Unknown'}
                                        </span>
                                    </div>
                                    <span className={styles.citationScore}>
                                        {(citation.score * 100).toFixed(0)}%
                                    </span>
                                </div>
                            ))}
                        </>
                    )}

                    {webCitations.length > 0 && (
                        <>
                            <div className={`${styles.citationsGroupHeader} ${styles.citationsGroupHeaderWeb}`}>
                                <i className="fas fa-globe" /> Web Results
                            </div>
                            {webCitations.map((citation) => (
                                <div
                                    key={citation.index}
                                    className={`${styles.citationCard} ${styles.citationCardWeb}`}
                                >
                                    <div className={styles.citationDoc}>
                                        <i className="fas fa-globe" />
                                        {citation.url ? (
                                            <a
                                                href={citation.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className={styles.citationWebLink}
                                                title={citation.doc_name || citation.url}
                                            >
                                                <span className={styles.citationDocName}>
                                                    {citation.doc_name || citation.url}
                                                </span>
                                                <i
                                                    className="fas fa-external-link-alt"
                                                    style={{ fontSize: '0.6rem', flexShrink: 0 }}
                                                />
                                            </a>
                                        ) : (
                                            <span className={styles.citationDocName}>
                                                {citation.doc_name || 'Unknown'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
