import React from 'react';
import styles from './slidesLoadingState.module.css';

type SlidesLoadingStateProps = {
  title?: string;
  subtitle?: string;
  compact?: boolean;
};

export default function SlidesLoadingState({
  title = 'AI is crafting your slides...',
  subtitle = 'Structuring logic, extracting key points, and preparing layouts.',
  compact = false,
}: SlidesLoadingStateProps) {
  return (
    <div className={`${styles.shell} ${compact ? styles.compact : ''}`} role="status" aria-live="polite">
      <div className={styles.spinnerCore}>
        <div className={`${styles.ring} ${styles.ring1}`}></div>
        <div className={`${styles.ring} ${styles.ring2}`}></div>
        <div className={`${styles.ring} ${styles.ring3}`}></div>
        <i className={`fas fa-brain ${styles.aiIcon}`}></i>
      </div>
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.subtitle}>{subtitle}</p>
    </div>
  );
}
