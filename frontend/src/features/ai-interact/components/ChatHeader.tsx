import React from 'react';
import { Link } from 'react-router-dom';
import styles from '../styles/AIInteract.module.css';
import type { AIRoleInfo } from '../api/aiApi';
import type { AITutorMode } from '../api/aiApi';

interface ChatHeaderProps {
    onOpenMemory?: () => void;
    roleInfo?: AIRoleInfo | null;
    tutorMode?: AITutorMode;
    setTutorMode?: (mode: AITutorMode) => void;
}

const ChatHeader = React.memo(function ChatHeader({ onOpenMemory, roleInfo, tutorMode = 'hint_only', setTutorMode }: ChatHeaderProps) {
    const isSocratic = roleInfo?.mode === 'socratic';

    return (
        <header className={styles['chat-main-header']}>
            <div className={styles['header-info']}>
                <h2><i className="fas fa-sparkles"></i> HKU AI Assistant</h2>
                <p>
                    Advanced Academic Model
                    {isSocratic && (
                        <span className={styles['mode-badge-socratic']}>
                            <i className="fas fa-graduation-cap"></i> Socratic Tutoring
                            {roleInfo?.rag_active && ' · RAG'}
                        </span>
                    )}
                    {roleInfo && !isSocratic && (
                        <span className={styles['mode-badge-direct']}>
                            <i className="fas fa-chalkboard-teacher"></i> Direct Mode
                        </span>
                    )}
                </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {roleInfo?.role === 'admin' && (
                    <div className={styles['tutor-mode-container']} title="This setting configures how the AI responds to Students. (Applies to student accounts only)">
                        <div className={styles['tutor-mode-label']}>
                            <i className="fas fa-user-graduate"></i>
                            <span>Student Output:</span>
                        </div>
                        <select
                            value={tutorMode}
                            onChange={(e) => setTutorMode?.(e.target.value as AITutorMode)}
                            className={styles['tutor-mode-select']}
                        >
                            <option value="tutor">Tutor (Detailed)</option>
                            <option value="hint_only">Hint-only</option>
                        </select>
                    </div>
                )}
                <button className={styles['memory-btn']} onClick={onOpenMemory} title="AI Memory — personalize your experience">
                    <i className="fas fa-brain"></i> Memory
                </button>
                <Link to="/" className={styles['back-home-btn']}>
                    <i className="fas fa-sign-out-alt"></i> Exit Workspace
                </Link>
            </div>
        </header>
    );
});

export default ChatHeader;

