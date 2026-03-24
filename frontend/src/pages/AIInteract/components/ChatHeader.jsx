import React from 'react';
import { Link } from 'react-router-dom';
import styles from '../../../styles/AIInteract.module.css';

export default function ChatHeader() {
    return (
        <header className={styles['chat-main-header']}>
            <div className={styles['header-info']}>
                <h2><i className="fas fa-sparkles"></i> HKU Coze AI Assistant</h2>
                <p>Advanced Academic Model</p>
            </div>
            <Link to="/" className={styles['back-home-btn']}>
                <i className="fas fa-sign-out-alt"></i> Exit Workspace
            </Link>
        </header>
    );
}