import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from '../styles/AIInteract.module.css';

function SidebarSkeleton() {
    return (
        <div className={styles['history-list']}>
            {[1, 2, 3, 4].map(i => (
                <div key={i} className={styles['skeleton-item']} style={{
                    height: 44, margin: '6px 0', borderRadius: 8,
                    background: 'linear-gradient(90deg, rgba(0,0,0,0.04) 25%, rgba(0,0,0,0.08) 50%, rgba(0,0,0,0.04) 75%)',
                    backgroundSize: '200% 100%',
                    animation: 'shimmer 1.5s ease-in-out infinite',
                }} />
            ))}
            <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
        </div>
    );
}

export default function Sidebar({ sessions, currentSessionId, deletingId, createNewSession, deleteSession }) {
    const isLoading = sessions === null;

    return (
        <aside className={styles['chat-sidebar']}>
            <button className={styles['new-chat-btn']} onClick={() => createNewSession(true)} disabled={isLoading}>
                <i className="fas fa-plus"></i> New Chat
            </button>
            <div className={styles['sidebar-title']}>Recent Conversations</div>
            {isLoading ? <SidebarSkeleton /> : (
                <div className={styles['history-list']}>
                    <AnimatePresence>
                        {(sessions || []).map((session, idx) => (
                            <motion.div 
                                key={session.id || `sess-${idx}`}
                                initial={{ opacity: 0, x: -20, height: 0 }}
                                animate={{ opacity: 1, x: 0, height: 'auto' }}
                                exit={{ opacity: 0, x: -20, height: 0 }}
                                transition={{ duration: 0.25, ease: "easeInOut" }}
                                style={{ overflow: 'hidden' }}
                            >
                                <div className={`${styles['history-item']} ${session.id === currentSessionId ? styles.active : ''} ${session.id === deletingId ? styles.deleting : ''}`}>
                                    <div className={styles['history-item-content']} onClick={() => createNewSession(false, session.id)}>
                                        <i className="far fa-comment-alt"></i>
                                        <span className={styles['history-text']}>{session.title}</span>
                                    </div>
                                    <button className={styles['delete-chat-btn']} onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }} title="Delete Chat">
                                        <i className="fas fa-trash-alt"></i>
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}
            <div className={styles['sidebar-footer']}>
                <div className={styles['user-status']}>
                    <div className={styles['status-dot']}></div>
                    <span>HKU Coze AI Ready</span>
                </div>
            </div>
        </aside>
    );
}