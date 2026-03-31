import React from 'react';
import { Link } from 'react-router-dom';
import styles from '../../../styles/AIInteract.module.css';

export default function ChatHeader({ onOpenMemory }) {
    return (
        <header className={styles['chat-main-header']}>
            <div className={styles['header-info']}>
                <h2><i className="fas fa-sparkles"></i> HKU Coze AI Assistant</h2>
                <p>Advanced Academic Model</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button className={styles['memory-btn']} onClick={onOpenMemory} title="AI Memory — personalize your experience">
                    <i className="fas fa-brain"></i> Memory
                </button>
                <Link to="/" className={styles['back-home-btn']}>
                    <i className="fas fa-sign-out-alt"></i> Exit Workspace
                </Link>
            </div>
        </header>
    );
}