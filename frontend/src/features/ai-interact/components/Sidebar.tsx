import React, { memo, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from '../styles/AISidebar.module.css';
import type { AIProvider, AIProviderHealth } from '../api/aiApi';
import {
    getSelectedChatModelOption,
    type ChatModelOption,
} from '../utils/chatModelOptions';

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
        </div>
    );
}

interface SidebarProps {
    sessions: Array<{ id: string; title?: string }> | null;
    currentSessionId: string | null;
    deletingId: string | null;
    createNewSession: (switchImmediately?: boolean) => void;
    switchSession: (id: string) => void;
    deleteSession: (id: string) => void;
    selectedProvider?: AIProvider;
    setSelectedProvider?: (provider: AIProvider) => void;
    configuredChatModels?: ChatModelOption[];
    chatModelsLoading?: boolean;
    providerHealth?: AIProviderHealth;
}

export default memo(function Sidebar({
    sessions,
    currentSessionId,
    deletingId,
    createNewSession,
    switchSession,
    deleteSession,
    selectedProvider = 'local_ollama',
    setSelectedProvider,
    configuredChatModels = [],
    chatModelsLoading = false,
    providerHealth,
}: SidebarProps) {
    const [isSelectorOpen, setIsSelectorOpen] = useState(false);
    const selectorRef = useRef<HTMLDivElement>(null);
    const isLoading = sessions === null;
    const healthMatchesProvider = providerHealth?.provider === selectedProvider;
    const providerChecking = !healthMatchesProvider || !!providerHealth?.checking;
    const providerReady = healthMatchesProvider && !!providerHealth?.ok && !providerChecking;
    const selectedModel = getSelectedChatModelOption(selectedProvider, configuredChatModels);
    const hasConfiguredModels = configuredChatModels.length > 0;

    useEffect(() => {
        if (!isSelectorOpen) {
            return;
        }

        const handlePointerDown = (event: MouseEvent) => {
            if (selectorRef.current && !selectorRef.current.contains(event.target as Node)) {
                setIsSelectorOpen(false);
            }
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsSelectorOpen(false);
            }
        };

        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [isSelectorOpen]);

    const getProviderDisplayName = () => {
        return selectedModel.modelLabel;
    };
    const statusText = providerChecking
        ? 'Checking status'
        : providerReady
            ? 'Ready'
            : 'Unavailable';

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
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.25, ease: "easeInOut" }}
                            >
                                <div className={`${styles['history-item']} ${session.id === currentSessionId ? styles.active : ''} ${session.id === deletingId ? styles.deleting : ''}`} onClick={() => switchSession(session.id)}>
                                    <div className={styles['history-item-content']}>
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
                <div className={styles['provider-switch-wrap']} ref={selectorRef}>
                    <button
                        type="button"
                        className={styles['provider-selector-trigger']}
                        onClick={() => setIsSelectorOpen((open) => !open)}
                        aria-expanded={isSelectorOpen}
                        aria-haspopup="listbox"
                        disabled={chatModelsLoading}
                    >
                        <span className={styles['provider-selector-copy']}>
                            <span className={styles['provider-selector-model']}>
                                {chatModelsLoading ? 'Loading models...' : selectedModel.modelLabel}
                            </span>
                            <span className={styles['provider-selector-provider']}>
                                {chatModelsLoading ? 'Reading AI Config' : selectedModel.providerLabel}
                            </span>
                        </span>
                        <i className={`fas fa-chevron-${isSelectorOpen ? 'down' : 'up'} ${styles['provider-selector-chevron']}`}></i>
                    </button>

                    {isSelectorOpen && (
                        <div className={styles['provider-selector-popover']} role="listbox" aria-label="Configured chat models">
                            <div className={styles['provider-selector-title']}>Configured Chat Models</div>
                            {hasConfiguredModels ? (
                                configuredChatModels.map((option) => {
                                    const isSelected = option.provider === selectedProvider;
                                    return (
                                        <button
                                            key={option.provider}
                                            type="button"
                                            className={`${styles['provider-option']} ${isSelected ? styles['provider-option-active'] : ''}`}
                                            onClick={() => {
                                                setSelectedProvider?.(option.provider);
                                                setIsSelectorOpen(false);
                                            }}
                                            role="option"
                                            aria-selected={isSelected}
                                        >
                                            <span className={styles['provider-option-copy']}>
                                                <span className={styles['provider-option-model']}>{option.modelLabel}</span>
                                                <span className={styles['provider-option-provider']}>{option.providerLabel}</span>
                                            </span>
                                            {isSelected && <i className={`fas fa-check ${styles['provider-option-check']}`}></i>}
                                        </button>
                                    );
                                })
                            ) : (
                                <div className={styles['provider-selector-empty']}>
                                    No chat model is configured in AI Config yet.
                                </div>
                            )}
                        </div>
                    )}
                </div>
                <div className={styles['user-status']}>
                    <div className={`${styles['status-dot']} ${!providerReady ? styles['status-dot-offline'] : ''}`}></div>
                    <span>{statusText}</span>
                </div>
                {!providerReady && healthMatchesProvider && providerHealth?.detail && (
                    <div className={styles['provider-detail']} title={providerHealth.detail}>
                        {providerHealth.detail}
                    </div>
                )}
            </div>
        </aside>
    );
}, (prev, next) => {
    // Only re-render when sidebar-relevant data changes, not on every
    // streaming frame that updates session messages.
    if (prev.currentSessionId !== next.currentSessionId) return false;
    if (prev.deletingId !== next.deletingId) return false;
    if (prev.selectedProvider !== next.selectedProvider) return false;
    if (prev.chatModelsLoading !== next.chatModelsLoading) return false;
    if (prev.configuredChatModels !== next.configuredChatModels) return false;
    if (prev.providerHealth !== next.providerHealth) return false;
    const ps = prev.sessions, ns = next.sessions;
    if (ps === ns) return true;
    if (!ps || !ns || ps.length !== ns.length) return false;
    return ps.every((s, i) => s.id === ns[i].id && s.title === ns[i].title);
});
