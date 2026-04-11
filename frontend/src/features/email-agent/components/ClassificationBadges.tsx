import React from 'react';
import { URGENCY_COLORS, CATEGORY_LABELS } from '../utils/emailUtils';
import styles from '../styles/EmailDetail.module.css';

interface ClassificationBadgesProps {
    isClassifying?: boolean;
    emailClassification?: Record<string, any> | null;
    classifyFailed?: boolean;
}

export default function ClassificationBadges({ isClassifying, emailClassification, classifyFailed }: ClassificationBadgesProps) {
    if (isClassifying) {
        return <span className={styles.classifyBadge} style={{ background: '#e3eaf5', color: '#546e8a' }}>Classifying...</span>;
    }
    if (classifyFailed) {
        return <span className={styles.classifyBadge} style={{ background: '#f5f5f5', color: '#9e9e9e' }}>AI classification unavailable</span>;
    }
    if (!emailClassification || emailClassification.raw_response) return null;
    const urgency = URGENCY_COLORS[emailClassification.urgency];
    return (
        <>
            {urgency && (
                <span className={styles.classifyBadge} style={{ background: urgency.bg, color: urgency.color }}>
                    {urgency.label}
                </span>
            )}
            {emailClassification.category && (
                <span className={styles.classifyBadge} style={{ background: '#e8eaf6', color: '#283593' }}>
                    {CATEGORY_LABELS[emailClassification.category] || emailClassification.category}
                </span>
            )}
        </>
    );
}
