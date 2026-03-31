import React from 'react';
import PropTypes from 'prop-types';
import styles from '../../styles/AIInteract.module.css';

import Sidebar from './components/Sidebar';
import ChatHeader from './components/ChatHeader';
import MessageList from './components/MessageList';
import ChatInput from './components/ChatInput';
import ConfirmModal from './components/ConfirmModal';
import MemoryModal from './components/MemoryModal';

export default function AIInteractPage({
    sessions, currentSessionId, inputText, isTyping, modalConfig, toastVisible,
    chatMessagesRef, inputRef, createNewSession, deleteSession, confirmDelete,
    setModalConfig, handleInput, handleKeyDown, handleSend, copyToClipboard, handleChatAreaClick, deletingId,
    // Methods passed down from Entry wrapper
    handleRegenerate, handleEditUserMsg, handleStop,
    attachedFiles, isUploadingFile, fileInputRef, handleFileChange, removeAttachedFile,
    // Memory
    memoryModalOpen, setMemoryModalOpen, aiMemory, saveMemory, savingMemory,
}) {
    const currentSession = (sessions || []).find(s => s.id === currentSessionId) || (sessions || [])[0];

    return (
        <>
            <div className={`global-ai-wrapper ${styles['ai-workspace-wrapper']}`}>
                <div className={styles['workspace-glow']}></div>

                <div className={styles['ai-workspace-container']}>
                    <Sidebar
                        sessions={sessions}
                        currentSessionId={currentSessionId}
                        deletingId={deletingId}
                        createNewSession={createNewSession}
                        deleteSession={deleteSession}
                    />

                    <main className={styles['chat-main']}>
                        <ChatHeader onOpenMemory={() => setMemoryModalOpen(true)} />

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

AIInteractPage.propTypes = {
    sessions: PropTypes.array,
    currentSessionId: PropTypes.string,
    inputText: PropTypes.string,
    isTyping: PropTypes.bool,
    modalConfig: PropTypes.object,
    toastVisible: PropTypes.bool,
    chatMessagesRef: PropTypes.object,
    inputRef: PropTypes.object,
    createNewSession: PropTypes.func,
    deleteSession: PropTypes.func,
    confirmDelete: PropTypes.func,
    setModalConfig: PropTypes.func,
    handleInput: PropTypes.func,
    handleKeyDown: PropTypes.func,
    handleSend: PropTypes.func,
    copyToClipboard: PropTypes.func,
    handleChatAreaClick: PropTypes.func,
    deletingId: PropTypes.string,
    handleRegenerate: PropTypes.func,
    handleEditUserMsg: PropTypes.func,
    handleStop: PropTypes.func,
    attachedFiles: PropTypes.array,
    isUploadingFile: PropTypes.bool,
    fileInputRef: PropTypes.object,
    handleFileChange: PropTypes.func,
    removeAttachedFile: PropTypes.func,
    memoryModalOpen: PropTypes.bool,
    setMemoryModalOpen: PropTypes.func,
    aiMemory: PropTypes.string,
    saveMemory: PropTypes.func,
    savingMemory: PropTypes.bool,
};