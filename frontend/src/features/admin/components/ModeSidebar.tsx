import React from 'react';
import styles from '../styles/AdminDashboard.module.css';
import type { AdminMode } from '../types';

interface ModeSidebarProps {
  activeMode: AdminMode;
  setActiveMode: (mode: AdminMode) => void;
}

export default function ModeSidebar({ activeMode, setActiveMode }: ModeSidebarProps) {
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
            <button
                className={`${styles.modeBtn} ${activeMode === 'llm-monitor' ? styles.modeBtnActive : ''}`}
                onClick={() => setActiveMode('llm-monitor')}
            >
                <i className="fas fa-chart-line"></i>
                LLM Cost Monitor
            </button>
            <button
                className={`${styles.modeBtn} ${activeMode === 'staff-codes' ? styles.modeBtnActive : ''}`}
                onClick={() => setActiveMode('staff-codes')}
            >
                <i className="fas fa-id-card"></i>
                Staff Codes
            </button>
            <button
                className={`${styles.modeBtn} ${activeMode === 'rag-eval' ? styles.modeBtnActive : ''}`}
                onClick={() => setActiveMode('rag-eval')}
            >
                <i className="fas fa-balance-scale"></i>
                RAG Evaluation
            </button>
        </aside>
    );
}
