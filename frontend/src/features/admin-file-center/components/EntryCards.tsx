import React from 'react';
import styles from '../styles/AdminFileCenter.module.css';

type Props = {
    onOpenGroup: () => void;
    onOpenPersonal: () => void;
};

export default function EntryCards({ onOpenGroup, onOpenPersonal }: Props) {
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
        </div>
    );
}
