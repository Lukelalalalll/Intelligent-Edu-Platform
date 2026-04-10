import React from 'react';
import SlidesLoadingState from '../../components/SlidesLoadingState';
import type { DeliveryArtifactType } from '../../../../api/slidesDeliveryApi';
import { deliveryTabs } from '../constants';

type Props = {
    styles: Record<string, string>;
    deliveryJobId?: string;
    deliveryError?: string;
    deliveryLoading: boolean;
    deliveryActiveTab: DeliveryArtifactType;
    setDeliveryActiveTab: (tab: DeliveryArtifactType) => void;
    deliveryArtifacts: Record<string, any>;
    renderDeliveryItem: (item: any, idx: number) => React.ReactNode;
};

export default function DeliveryPackSection({
    styles,
    deliveryJobId,
    deliveryError,
    deliveryLoading,
    deliveryActiveTab,
    setDeliveryActiveTab,
    deliveryArtifacts,
    renderDeliveryItem,
}: Props) {
    if (!deliveryJobId && !deliveryError) return null;

    const activeArtifact = deliveryArtifacts?.[deliveryActiveTab];

    return (
        <section className={`card ${styles.sectionCard} ${styles.deliveryCard}`}>
            <div className={styles.cardHeader}>
                <div className={styles.cardIcon}><i className="fas fa-chalkboard-teacher"></i></div>
                <h2 className={styles.sectionTitle}>Delivery Pack</h2>
            </div>

            <div className={styles.deliveryTabs}>
                {deliveryTabs.map((tab) => (
                    <button
                        key={tab.key}
                        type="button"
                        className={`${styles.deliveryTabBtn} ${deliveryActiveTab === tab.key ? styles.deliveryTabBtnActive : ''}`}
                        onClick={() => setDeliveryActiveTab(tab.key)}
                    >
                        <i className={`fas ${tab.icon}`}></i> {tab.label}
                    </button>
                ))}
            </div>

            {deliveryError && <div className={`alert alert-warning ${styles.deliveryAlert}`}>{deliveryError}</div>}

            {deliveryLoading && (
                <div style={{ marginTop: '12px' }}>
                    <SlidesLoadingState compact title="Preparing delivery artifact" subtitle="Generating tab content from your final slide schema." />
                </div>
            )}

            {!deliveryLoading && !activeArtifact && !deliveryError && (
                <div className={styles.deliveryEmpty}>No artifact loaded for this tab yet.</div>
            )}

            {!deliveryLoading && !!activeArtifact && (
                <div className={styles.deliveryBody}>
                    {Array.isArray(activeArtifact)
                        ? activeArtifact.map((item, idx) => renderDeliveryItem(item, idx))
                        : renderDeliveryItem(activeArtifact, 0)}
                </div>
            )}
        </section>
    );
}
