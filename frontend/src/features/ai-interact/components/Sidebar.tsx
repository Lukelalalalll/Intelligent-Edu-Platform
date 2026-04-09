import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from '../styles/AIInteract.module.css';
import type { AIProvider } from '../../../api/aiApi';

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

interface SidebarProps {
    sessions: Array<{ id: string; title?: string }> | null;
    currentSessionId: string | null;
    deletingId: string | null;
    createNewSession: (switchImmediately?: boolean, forceId?: string | null) => void;
    deleteSession: (id: string) => void;
    selectedProvider?: AIProvider;
    setSelectedProvider?: (provider: AIProvider) => void;
    providerHealth?: { ok: boolean; detail: string };
}

export default function Sidebar({
    sessions,
    currentSessionId,
    deletingId,
    createNewSession,
    deleteSession,
    selectedProvider = 'local_ollama',
    setSelectedProvider,
    providerHealth,
}: SidebarProps) {
    const isLoading = sessions === null;
    const isLocal = selectedProvider === 'local_ollama';
    const localReady = !!providerHealth?.ok;

    const statusText = isLocal
        ? (localReady ? 'llama3.2 Ready' : 'llama3.2 Offline')
        : 'HKU Coze AI Ready';

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
                <div className={styles['provider-switch-wrap']}>
                    <button
                        type="button"
                        className={`${styles['provider-chip']} ${!isLocal ? styles['provider-chip-active'] : ''}`}
                        onClick={() => setSelectedProvider?.('coze')}
                    >
                        Coze
                    </button>
                    <button
                        type="button"
                        className={`${styles['provider-chip']} ${isLocal ? styles['provider-chip-active'] : ''}`}
                        onClick={() => setSelectedProvider?.('local_ollama')}
                    >
                        llama3.2
                    </button>
                </div>
                <div className={styles['user-status']}>
                    <div className={`${styles['status-dot']} ${isLocal && !localReady ? styles['status-dot-offline'] : ''}`}></div>
                    <span>{statusText}</span>
                </div>
                {isLocal && !localReady && providerHealth?.detail && (
                    <div className={styles['provider-detail']} title={providerHealth.detail}>
                        {providerHealth.detail}
                    </div>
                )}
            </div>
        </aside>
    );
}