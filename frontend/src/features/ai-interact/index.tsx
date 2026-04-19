import React, { useRef } from 'react';
import styles from './styles/AIInteract.module.css';
import type { AIRoleInfo, AIProvider, AITutorMode } from './api/aiApi';
import { useResizableSidebar } from './hooks/useResizableSidebar';

import Sidebar from './components/Sidebar';
import ChatHeader from './components/ChatHeader';
import MessageList from './components/MessageList';
import ChatInput from './components/ChatInput';
import ConfirmModal from './components/ConfirmModal';
import MemoryModal from './components/MemoryModal';

// ── Sidebar dimension constants ───────────────────────────────────────────────
const SIDEBAR_MIN_WIDTH = 180;
const SIDEBAR_MAX_WIDTH = 520;
const SIDEBAR_DEFAULT_WIDTH = 300;

// ── Prop types grouped by domain ──────────────────────────────────────────────

interface SessionProps {
    sessions?: Array<{ id: string; title?: string; messages?: Array<{ role: string; content: string }> }>;
    currentSessionId?: string;
    createNewSession?: () => void;
    deleteSession?: (id: string) => void;
    confirmDelete?: () => void;
    deletingId?: string;
}

interface ChatProps {
    inputText?: string;
    isTyping?: boolean;
    toastVisible?: boolean;
    chatMessagesRef?: React.RefObject<HTMLElement | null>;
    inputRef?: React.RefObject<HTMLTextAreaElement | null>;
    handleInput?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    handleKeyDown?: (e: React.KeyboardEvent) => void;
    handleSend?: () => void;
    handleStop?: () => void;
    copyToClipboard?: (text: string) => void;
    handleChatAreaClick?: (e?: React.MouseEvent) => void;
    handleRegenerate?: (msgId: string) => void;
    handleEditUserMsg?: (msgId: string, content: string) => void;
}

interface AttachmentProps {
    attachedFiles?: File[];
    isUploadingFile?: boolean;
    fileInputRef?: React.RefObject<HTMLInputElement | null>;
    handleFileChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    removeAttachedFile?: (index: number) => void;
}

interface MemoryProps {
    memoryModalOpen?: boolean;
    setMemoryModalOpen?: (open: boolean) => void;
    aiMemory?: Record<string, unknown>;
    saveMemory?: (data: Record<string, unknown>) => void;
    savingMemory?: boolean;
}

interface ModalProps {
    modalConfig?: { show: boolean; sessionId: string | null };
    setModalConfig?: (config: { show: boolean; sessionId: string | null }) => void;
}

interface ProviderProps {
    selectedProvider?: AIProvider;
    setSelectedProvider?: (provider: AIProvider) => void;
    providerHealth?: { ok: boolean; detail: string };
    tutorMode?: AITutorMode;
    setTutorMode?: (mode: AITutorMode) => void;
    roleInfo?: AIRoleInfo | null;
}

export type AIInteractPageProps = SessionProps & ChatProps & AttachmentProps & MemoryProps & ModalProps & ProviderProps;

export default function AIInteractPage({
    // Session
    sessions, currentSessionId, createNewSession, deleteSession, confirmDelete, deletingId,
    // Chat
    inputText, isTyping, toastVisible, chatMessagesRef, inputRef,
    handleInput, handleKeyDown, handleSend, handleStop,
    copyToClipboard, handleChatAreaClick, handleRegenerate, handleEditUserMsg,
    // Attachments
    attachedFiles, isUploadingFile, fileInputRef, handleFileChange, removeAttachedFile,
    // Memory
    memoryModalOpen, setMemoryModalOpen, aiMemory, saveMemory, savingMemory,
    // Modal
    modalConfig, setModalConfig,
    // Provider / role
    selectedProvider, setSelectedProvider, providerHealth, tutorMode, setTutorMode, roleInfo,
}: AIInteractPageProps) {
    const currentSession = currentSessionId
        ? (sessions ?? []).find(s => s.id === currentSessionId)
        : undefined;

    // ── Resizable sidebar ──
    const containerRef = useRef<HTMLDivElement>(null);
    const { sidebarWidth, isDragging, handleMouseDown } = useResizableSidebar({
        minWidth: SIDEBAR_MIN_WIDTH,
        maxWidth: SIDEBAR_MAX_WIDTH,
        defaultWidth: SIDEBAR_DEFAULT_WIDTH,
        containerRef,
    });

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
                            onOpenMemory={() => setMemoryModalOpen?.(true)}
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
                show={modalConfig?.show ?? false}
                setModalConfig={setModalConfig}
                confirmDelete={confirmDelete}
            />

            <MemoryModal
                show={memoryModalOpen ?? false}
                onClose={() => setMemoryModalOpen?.(false)}
                memory={aiMemory}
                onSave={saveMemory}
                saving={savingMemory}
            />

            {/* Toast – styles defined in AIInteract.module.css (.copy-toast / .copy-toast-visible) */}
            <div className={`${styles['copy-toast']} ${toastVisible ? styles['copy-toast-visible'] : ''}`}>
                Copied to clipboard!
            </div>
        </>
    );
}

