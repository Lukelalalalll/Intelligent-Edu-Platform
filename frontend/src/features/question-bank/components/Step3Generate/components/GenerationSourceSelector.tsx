import React from 'react';
import styles from '../../../styles/sub2.module.css';
import type { GenerationSourceSelectorProps } from '../types';

export default function GenerationSourceSelector({
    generationSource,
    generationMode,
    fileName,
    selectedPages,
    savedScreenshots,
    setGenerationSource,
}: GenerationSourceSelectorProps) {
    const canUseScreenshots = savedScreenshots.length > 0;
    const pageScopeLabel = selectedPages.length > 0 ? `${selectedPages.length} selected page(s)` : 'All pages';

    return (
        <div className={styles.formGroup}>
            <label>Generation Source:</label>
            <div className={styles.sourceCardGrid}>
                <button
                    type="button"
                    className={`${styles.sourceCard} ${generationSource === 'pdf' ? styles.sourceCardActive : ''}`}
                    onClick={() => setGenerationSource('pdf')}
                >
                    <span className={styles.sourceTitle}><i className="fas fa-file-pdf"></i> PDF Content</span>
                    <small>{fileName || 'Uploaded file'}</small>
                    <small>Scope: {pageScopeLabel}</small>
                </button>

                <button
                    type="button"
                    className={`${styles.sourceCard} ${generationSource === 'screenshot_set' ? styles.sourceCardActive : ''}`}
                    onClick={() => setGenerationSource('screenshot_set')}
                    disabled={!canUseScreenshots}
                >
                    <span className={styles.sourceTitle}><i className="fas fa-images"></i> Visual Reference Set</span>
                    <small>Use your curated visual reference set as generation context.</small>
                    <small>{savedScreenshots.length} image{savedScreenshots.length !== 1 ? 's' : ''} ready for generation.</small>
                </button>
            </div>
            {!canUseScreenshots && generationMode === 'extract_first' && (
                <div className={styles.infoBox} style={{ marginTop: '10px' }}>
                    Curate screenshots in Step 2 to enable Visual Reference Set.
                </div>
            )}
        </div>
    );
}
