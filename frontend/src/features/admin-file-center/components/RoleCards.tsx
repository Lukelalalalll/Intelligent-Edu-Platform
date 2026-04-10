import React from 'react';
import styles from '../styles/AdminFileCenter.module.css';

type Props = {
    onTeacher: () => void;
    onStudent: () => void;
};

export default function RoleCards({ onTeacher, onStudent }: Props) {
    return (
        <div className={styles.cardGrid}>
            <button className={styles.entryCard} type="button" onClick={onTeacher}>
                <div className={styles.cardIconWrap}>
                    <i className="fa-solid fa-chalkboard-user"></i>
                </div>
                <h3 className={styles.entryTitle}>Teacher Assets</h3>
                <p className={styles.entryText}>Audit and manage files generated during teacher-AI sessions.</p>
            </button>
            <button className={styles.entryCard} type="button" onClick={onStudent}>
                <div className={styles.cardIconWrap}>
                    <i className="fa-solid fa-user-graduate"></i>
                </div>
                <h3 className={styles.entryTitle}>Student Assets</h3>
                <p className={styles.entryText}>Audit and manage files generated during student-AI sessions.</p>
            </button>
        </div>
    );
}
