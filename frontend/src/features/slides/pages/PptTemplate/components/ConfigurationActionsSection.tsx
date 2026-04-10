import React from 'react';

type Props = {
    styles: Record<string, string>;
    selectedTheme: string;
    canGenerate: boolean;
    remainingSlides: number;
    deliveryLoading: boolean;
    generatePpt: () => void;
    generateDeliveryPack: () => void;
};

export default function ConfigurationActionsSection({
    styles,
    selectedTheme,
    canGenerate,
    remainingSlides,
    deliveryLoading,
    generatePpt,
    generateDeliveryPack,
}: Props) {
    return (
        <section className={`card ${styles.sectionCard}`}>
            <div className={styles.actionGrid}>
                <div className={styles.summaryBox}>
                    <h5 className={styles.summaryTitle}>Configuration Summary</h5>
                    <div className={styles.statItem}><span>Theme</span><strong>{selectedTheme || 'Not selected'}</strong></div>
                    <div className={styles.statItem}><span>Status</span><strong>{canGenerate ? 'Ready to Generate' : `${remainingSlides} slides remaining`}</strong></div>
                </div>
                <div className={styles.actionButtons}>
                    <button
                        type="button"
                        className={`btn btn-primary ${styles.generateBtn}`}
                        onClick={generatePpt}
                        disabled={!canGenerate}
                        title={!canGenerate ? `Configure all slides first (${remainingSlides} remaining)` : 'Generate PowerPoint'}
                    >
                        <i className="fas fa-file-powerpoint"></i> Generate PPT
                    </button>
                    <button
                        type="button"
                        className={styles.deliveryBtn}
                        onClick={generateDeliveryPack}
                        disabled={!canGenerate || deliveryLoading}
                    >
                        {deliveryLoading
                            ? <><i className="fas fa-spinner fa-spin"></i> Building...</>
                            : <><i className="fas fa-box-open"></i> Generate Delivery Pack</>}
                    </button>
                </div>
            </div>
        </section>
    );
}
