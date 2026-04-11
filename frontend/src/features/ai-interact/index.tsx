import React, { useState, useCallback, useRef } from 'react';
import styles from './styles/AIInteract.module.css';
import type { AIRoleInfo } from './api/aiApi';
import type { AIProvider } from './api/aiApi';
import type { AITutorMode } from './api/aiApi';

import Sidebar from './components/Sidebar';
import ChatHeader from './components/ChatHeader';
import MessageList from './components/MessageList';
import ChatInput from './components/ChatInput';
import ConfirmModal from './components/ConfirmModal';
import MemoryModal from './components/MemoryModal';

interface AIInteractPageProps {
    sessions?: Array<{ id: string; title?: string; messages?: Array<{ role: string; content: string }> }>;
    currentSessionId?: string;
    inputText?: string;
    isTyping?: boolean;
    modalConfig?: { show: boolean; sessionId: string | null };
    toastVisible?: boolean;
    chatMessagesRef?: React.RefObject<HTMLElement | null>;
    inputRef?: React.RefObject<HTMLTextAreaElement | null>;
    createNewSession?: () => void;
    deleteSession?: (id: string) => void;
    confirmDelete?: () => void;
    setModalConfig?: (config: { show: boolean; sessionId: string | null }) => void;
    handleInput?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    handleKeyDown?: (e: React.KeyboardEvent) => void;
    handleSend?: () => void;
    copyToClipboard?: (text: string) => void;
    handleChatAreaClick?: (e?: React.MouseEvent) => void;
    deletingId?: string;
    handleRegenerate?: (msgId: string) => void;
    handleEditUserMsg?: (msgId: string, content: string) => void;
    handleStop?: () => void;
    attachedFiles?: File[];
    isUploadingFile?: boolean;
    fileInputRef?: React.RefObject<HTMLInputElement | null>;
    handleFileChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    removeAttachedFile?: (index: number) => void;
    memoryModalOpen?: boolean;
    setMemoryModalOpen?: (open: boolean) => void;
    aiMemory?: Record<string, unknown>;
    saveMemory?: (data: Record<string, unknown>) => void;
    savingMemory?: boolean;
    roleInfo?: AIRoleInfo | null;
    selectedProvider?: AIProvider;
    setSelectedProvider?: (provider: AIProvider) => void;
    providerHealth?: { ok: boolean; detail: string };
    tutorMode?: AITutorMode;
    setTutorMode?: (mode: AITutorMode) => void;
}

export default function AIInteractPage({
    sessions, currentSessionId, inputText, isTyping, modalConfig, toastVisible,
    chatMessagesRef, inputRef, createNewSession, deleteSession, confirmDelete,
    setModalConfig, handleInput, handleKeyDown, handleSend, copyToClipboard, handleChatAreaClick, deletingId,
    // Methods passed down from Entry wrapper
    handleRegenerate, handleEditUserMsg, handleStop,
    attachedFiles, isUploadingFile, fileInputRef, handleFileChange, removeAttachedFile,
    // Memory
    memoryModalOpen, setMemoryModalOpen, aiMemory, saveMemory, savingMemory,
    // Role info
    roleInfo,
    selectedProvider,
    setSelectedProvider,
    providerHealth,
    tutorMode,
    setTutorMode,
}: AIInteractPageProps) {
    const currentSession = (sessions || []).find(s => s.id === currentSessionId) || (sessions || [])[0];

    // ── Resizable sidebar ──
    const [sidebarWidth, setSidebarWidth] = useState(300);
    const [isDragging, setIsDragging] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const isDraggingRef = useRef(false);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        isDraggingRef.current = true;
        setIsDragging(true);

        const handleMouseMove = (ev: MouseEvent) => {
            if (!isDraggingRef.current || !containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const newWidth = ev.clientX - rect.left;
            if (newWidth >= 180 && newWidth <= 520) setSidebarWidth(newWidth);
        };

        const handleMouseUp = () => {
            isDraggingRef.current = false;
            setIsDragging(false);
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }, []);

    return (
        <>
            <div className={`global-ai-wrapper ${styles['ai-workspace-wrapper']}`}>
                <div className={styles['workspace-glow']}></div>

                <div
                    className={`${styles['ai-workspace-container']} ${isDragging ? styles['ai-container-dragging'] : ''}`}
                    ref={containerRef}
                    style={{ cursor: isDragging ? 'col-resize' : undefined }}
                >
                    <div style={{ width: sidebarWidth, flexShrink: 0, display: 'flex' }}>
                        <Sidebar
                            sessions={sessions}
                            currentSessionId={currentSessionId}
                            deletingId={deletingId}
                            createNewSession={createNewSession}
                            deleteSession={deleteSession}
                            selectedProvider={selectedProvider}
                            setSelectedProvider={setSelectedProvider}
                            providerHealth={providerHealth}
                        />
                    </div>

                    {/* Resizer */}
                    <div
                        className={`${styles['ai-resizer']} ${isDragging ? styles['ai-resizer-dragging'] : ''}`}
                        onMouseDown={handleMouseDown}
                    />

                    <main className={styles['chat-main']}>
                        <ChatHeader
                            onOpenMemory={() => setMemoryModalOpen(true)}
                            roleInfo={roleInfo}
                            tutorMode={tutorMode}
                            setTutorMode={setTutorMode}
                        />

                        <MessageList
                            currentSession={currentSession}
                            isTyping={isTyping}
                            chatMessagesRef={chatMessagesRef}
                            handleChatAreaClick={handleChatAreaClick}
                            copyToClipboard={copyToClipboard}
                            handleRegenerate={handleRegenerate}
                            handleEditUserMsg={handleEditUserMsg}
                        />

                        <ChatInput
                            inputText={inputText}
                            handleInput={handleInput}
                            handleKeyDown={handleKeyDown}
                            handleSend={handleSend}
                            isTyping={isTyping}
                            inputRef={inputRef}
                            attachedFiles={attachedFiles}
                            isUploadingFile={isUploadingFile}
                            fileInputRef={fileInputRef}
                            handleFileChange={handleFileChange}
                            removeAttachedFile={removeAttachedFile}
                            handleStop={handleStop}
                        />
                    </main>
                </div>
            </div>

            <ConfirmModal
                show={modalConfig.show}
                setModalConfig={setModalConfig}
                confirmDelete={confirmDelete}
            />

            <MemoryModal
                show={memoryModalOpen}
                onClose={() => setMemoryModalOpen(false)}
                memory={aiMemory}
                onSave={saveMemory}
                saving={savingMemory}
            />

            <div className={`toast ${toastVisible ? 'show' : ''}`} style={{
                position: 'fixed', top: '20px', right: '20px', background: '#333', color: 'white',
                padding: '10px 20px', borderRadius: '5px', opacity: toastVisible ? 1 : 0,
                transition: 'opacity 0.3s', pointerEvents: 'none', zIndex: 9999
            }}>Copied to clipboard!</div>

            <style>{`@keyframes bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }`}</style>
        </>
    );
}

