import React from 'react';
import styles from '../../../styles/AdminDashboard.module.css';

export default function ModeSidebar({ activeMode, setActiveMode }) {
    return (
        <aside className={styles.modeSidebar}>
            <button
                className={`${styles.modeBtn} ${activeMode === 'users' ? styles.modeBtnActive : ''}`}
                onClick={() => setActiveMode('users')}
            >
                <i className="fas fa-users-cog"></i>
                Manage User Info
            </button>
            <button
                className={`${styles.modeBtn} ${activeMode === 'relations' ? styles.modeBtnActive : ''}`}
                onClick={() => setActiveMode('relations')}
            >
                <i className="fas fa-project-diagram"></i>
                Manage Course Relations
            </button>
        </aside>
    );
}