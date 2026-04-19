import React from 'react';
import styles from '../styles/AdminFileCenter.module.css';

type Props = {
    onOpenGroup: () => void;
    onOpenPersonal: () => void;
    onOpenToolHistory: () => void;
};

export default function EntryCards({ onOpenGroup, onOpenPersonal, onOpenToolHistory }: Props) {
    return (
        <div className={styles.cardGrid}>
            <button className={styles.entryCard} type="button" onClick={onOpenGroup}>
                <div className={styles.cardIconWrap}>
                    <i className="fa-solid fa-comments"></i>
                </div>
                <h3 className={styles.entryTitle}>Group Chat Files</h3>
                <p className={styles.entryText}>View and manage all group chat attachments. Monitor files and execute soft or hard deletions.</p>
            </button>
            <button className={styles.entryCard} type="button" onClick={onOpenPersonal}>
                <div className={styles.cardIconWrap}>
                    <i className="fa-solid fa-robot"></i>
                </div>
                <h3 className={styles.entryTitle}>Personal AI Files</h3>
                <p className={styles.entryText}>Select a role and user to browse AI-generated assets grouped by session dates.</p>
            </button>
            <button className={styles.entryCard} type="button" onClick={onOpenToolHistory}>
                <div className={styles.cardIconWrap}>
                    <i className="fa-solid fa-clock-rotate-left"></i>
                </div>
                <h3 className={styles.entryTitle}>Tool History</h3>
                <p className={styles.entryText}>Browse and manage generation history across all tools — Slides, Diagrams, Notes, Questions, Knowledge Base, and Video.</p>
            </button>
        </div>
    );
}
