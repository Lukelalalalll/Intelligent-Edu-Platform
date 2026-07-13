import React, { Suspense, lazy, useMemo, useRef } from 'react';
import workspaceStyles from '../styles/AIWorkspace.module.css';
import type { AIRoleInfo, AIProvider, AIProviderHealth, AITutorMode, AISearchEngine } from '../api/aiApi';
import type { ChatModelOption } from '../utils/chatModelOptions';
import {
    useResizableSidebar,
    SIDEBAR_MIN_WIDTH,
    SIDEBAR_MAX_WIDTH,
    SIDEBAR_DEFAULT_WIDTH,
} from '../hooks/useResizableSidebar';

import Sidebar from './Sidebar';
import ChatHeader from './ChatHeader';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import ConfirmModal from './ConfirmModal';

const MemoryModal = lazy(() => import('./MemoryModal'));

// ── Prop types grouped by domain ──────────────────────────────────────────────

interface SessionProps {
    sessions: Array<{ id: string; title?: string; messages: Array<{ role: string; content: string }> }> | null;
    currentSessionId: string | null;
    createNewSession: () => void;
    switchSession: (id: string) => void;
    deleteSession: (id: string) => void;
    confirmDelete: () => void;
    deletingId: string | null;
}

interface ChatProps {
    inputText: string;
    isTyping: boolean;
    toastVisible?: boolean;
    chatMessagesRef: React.RefObject<HTMLDivElement>;
    inputRef: React.RefObject<HTMLTextAreaElement>;
    handleInput: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
    handleSend: () => void;
    handleStop: () => void;
    copyToClipboard?: (text: string, el?: HTMLElement | null) => void;
    handleChatAreaClick: (e: React.MouseEvent) => void;
    handleRegenerate?: (msgId: number) => void;
    handleEditUserMsg?: (msgId: number, content: string) => void;
}

interface AttachmentProps {
    attachedFiles: Array<{ file: File; file_name: string; mime_type: string }>;
    isUploadingFile: boolean;
    fileInputRef: React.RefObject<HTMLInputElement>;
    handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    removeAttachedFile: (index: number) => void;
}

interface MemoryProps {
    memoryModalOpen: boolean;
    setMemoryModalOpen: (open: boolean) => void;
    aiMemory?: Record<string, unknown>;
    saveMemory: (data: Record<string, unknown>) => void;
    savingMemory?: boolean;
}

interface ModalProps {
    modalConfig: { show: boolean; sessionId: string | null };
    setModalConfig: (config: { show: boolean; sessionId: string | null }) => void;
}

interface ProviderProps {
    selectedProvider?: AIProvider;
    setSelectedProvider?: (provider: AIProvider) => void;
    configuredChatModels?: ChatModelOption[];
    chatModelsLoading?: boolean;
    providerHealth?: AIProviderHealth;
    tutorMode?: AITutorMode;
    setTutorMode?: (mode: AITutorMode) => void;
    roleInfo?: AIRoleInfo | null;
    webSearch?: boolean;
    setWebSearch?: (v: boolean) => void;
    searchEngine?: AISearchEngine;
    setSearchEngine?: (e: AISearchEngine) => void;
    enableThinking?: boolean;
    setEnableThinking?: (v: boolean) => void;
}

export type AIInteractPageProps = SessionProps & ChatProps & AttachmentProps & MemoryProps & ModalProps & ProviderProps;

export default function AIInteractPage({
    // Session
    sessions, currentSessionId, createNewSession, switchSession, deleteSession, confirmDelete, deletingId,
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
    selectedProvider, setSelectedProvider, configuredChatModels, chatModelsLoading, providerHealth, tutorMode, setTutorMode, roleInfo,
    webSearch, setWebSearch, searchEngine, setSearchEngine,
    enableThinking, setEnableThinking,
}: AIInteractPageProps) {
    const currentSession = useMemo(
        () => currentSessionId ? (sessions ?? []).find(s => s.id === currentSessionId) : undefined,
        [sessions, currentSessionId],
    );

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
            <div className={`global-ai-wrapper ${workspaceStyles['ai-workspace-wrapper']}`}>
                <div className={workspaceStyles['workspace-glow']}></div>

                <div
                    className={`${workspaceStyles['ai-workspace-container']} ${isDragging ? workspaceStyles['ai-container-dragging'] : ''}`}
                    ref={containerRef}
                    style={{ cursor: isDragging ? 'col-resize' : undefined }}
                >
                    <div className={workspaceStyles['sidebar-shell']} style={{ width: sidebarWidth }}>
                        <Sidebar
                            sessions={sessions}
                            currentSessionId={currentSessionId}
                            deletingId={deletingId}
                            createNewSession={createNewSession}
                            switchSession={switchSession}
                            deleteSession={deleteSession}
                            selectedProvider={selectedProvider}
                            setSelectedProvider={setSelectedProvider}
                            configuredChatModels={configuredChatModels}
                            chatModelsLoading={chatModelsLoading}
                            providerHealth={providerHealth}
                        />
                    </div>

                    {/* Resizer */}
                    <div
                        className={`${workspaceStyles['ai-resizer']} ${isDragging ? workspaceStyles['ai-resizer-dragging'] : ''}`}
                        onMouseDown={handleMouseDown}
                    />

                    <main className={workspaceStyles['chat-main']}>
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
                            webSearch={webSearch}
                            setWebSearch={setWebSearch}
                            searchEngine={searchEngine}
                            setSearchEngine={setSearchEngine}
                            selectedProvider={selectedProvider}
                            enableThinking={enableThinking}
                            setEnableThinking={setEnableThinking}
                        />
                    </main>
                </div>
            </div>

            <ConfirmModal
                show={modalConfig?.show ?? false}
                setModalConfig={setModalConfig}
                confirmDelete={confirmDelete}
            />

            <Suspense fallback={null}>
                {memoryModalOpen && (
                    <MemoryModal
                        show={memoryModalOpen}
                        onClose={() => setMemoryModalOpen?.(false)}
                        memory={aiMemory}
                        onSave={saveMemory}
                        saving={savingMemory}
                    />
                )}
            </Suspense>

            {/* Toast – styles defined in AIInteract.module.css (.copy-toast / .copy-toast-visible) */}
            <div className={`${workspaceStyles['copy-toast']} ${toastVisible ? workspaceStyles['copy-toast-visible'] : ''}`}>
                Copied to clipboard!
            </div>
        </>
    );
}

