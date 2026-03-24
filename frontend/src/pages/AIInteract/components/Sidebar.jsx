import React from 'react';
import styles from '../../../styles/AIInteract.module.css';

export default function Sidebar({ sessions, currentSessionId, deletingId, createNewSession, deleteSession }) {
    return (
        <aside className={styles['chat-sidebar']}>
            <button className={styles['new-chat-btn']} onClick={() => createNewSession(true)}>
                <i className="fas fa-plus"></i> New Chat
            </button>
            <div className={styles['sidebar-title']}>Recent Conversations</div>
            <div className={styles['history-list']}>
                {sessions.map((session, idx) => (
                    <div key={session.id || `sess-${idx}`} className={`${styles['history-item']} ${session.id === currentSessionId ? styles.active : ''} ${session.id === deletingId ? styles.deleting : ''}`}>
                        <div className={styles['history-item-content']} onClick={() => createNewSession(false, session.id)}>
                            <i className="far fa-comment-alt"></i>
                            <span className={styles['history-text']}>{session.title}</span>
                        </div>
                        <button className={styles['delete-chat-btn']} onClick={(e) => deleteSession(e, session.id)} title="Delete Chat">
                            <i className="fas fa-trash-alt"></i>
                        </button>
                    </div>
                ))}
            </div>
            <div className={styles['sidebar-footer']}>
                <div className={styles['user-status']}>
                    <div className={styles['status-dot']}></div>
                    <span>HKU Coze AI Ready</span>
                </div>
            </div>
        </aside>
    );
}