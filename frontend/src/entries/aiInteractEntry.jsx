import React, { useState, useEffect, useRef, useCallback } from 'react';
import AIInteract from '../pages/AIInteract/index';
import { usePretextMeasure } from '../hooks/usePretextMeasure';
import { useAISessions, useAIMemory } from '../hooks/useAISessions';

export default function AIInteractEntry() {
    // Business logic from hooks
    const ai = useAISessions();
    const mem = useAIMemory();

    // UI-only local state
    const [inputText, setInputText] = useState('');
    const [toastVisible, setToastVisible] = useState(false);
    const chatMessagesRef = useRef(null);
    const inputRef = useRef(null);
    const fileInputRef = useRef(null);
    const [attachedFiles, setAttachedFiles] = useState([]);
    const [isUploadingFile] = useState(false);

    // Scroll management
    const { scrollToBottom } = usePretextMeasure(chatMessagesRef, {
        font: '16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        lineHeight: 25.6,
        debounceMs: 60,
    });

    useEffect(() => {
        scrollToBottom(!ai.isTyping);
    }, [ai.sessions, scrollToBottom, ai.isTyping]);

    // Input handling
    const handleInput = (e) => {
        setInputText(e.target.value);
        e.target.style.height = 'auto';
        e.target.style.height = e.target.scrollHeight + 'px';
    };

    const handleSend = () => {
        if (!inputText.trim()) return;
        ai.sendMessage(inputText);
        setInputText('');
        if (inputRef.current) inputRef.current.style.height = 'auto';
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    };

    // Clipboard
    const showToast = useCallback(() => { setToastVisible(true); setTimeout(() => setToastVisible(false), 2500); }, []);

    const copyToClipboard = useCallback((text, buttonEl = null) => {
        navigator.clipboard.writeText(text).then(showToast).catch(() => {
            const ta = document.createElement('textarea');
            ta.value = text; document.body.appendChild(ta); ta.select();
            document.execCommand('copy'); document.body.removeChild(ta); showToast();
        });
        if (buttonEl) {
            const orig = buttonEl.innerHTML;
            buttonEl.innerHTML = '<i class="fas fa-check" style="color:#27c93f;"></i> Copied!';
            setTimeout(() => { if (buttonEl) buttonEl.innerHTML = orig; }, 2000);
        }
    }, [showToast]);

    const handleChatAreaClick = useCallback((e) => {
        const btn = e.target.closest('.js-code-copy-btn');
        if (btn) copyToClipboard(decodeURIComponent(btn.getAttribute('data-code')), btn);
    }, [copyToClipboard]);

    // File attachments
    const handleFileChange = useCallback((e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        setAttachedFiles(prev => [...prev, ...files.map(f => ({ file: f, file_name: f.name, mime_type: f.type }))]);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }, []);

    const removeAttachedFile = useCallback((idx) => {
        setAttachedFiles(prev => prev.filter((_, i) => i !== idx));
    }, []);

    return (
        <AIInteract
            sessions={ai.sessions}
            currentSessionId={ai.currentSessionId}
            inputText={inputText}
            isTyping={ai.isTyping}
            modalConfig={ai.modalConfig}
            toastVisible={toastVisible}
            chatMessagesRef={chatMessagesRef}
            inputRef={inputRef}
            createNewSession={ai.createNewSession}
            deleteSession={ai.promptDelete}
            confirmDelete={ai.confirmDelete}
            setModalConfig={ai.setModalConfig}
            handleInput={handleInput}
            handleKeyDown={handleKeyDown}
            handleSend={handleSend}
            copyToClipboard={copyToClipboard}
            handleChatAreaClick={handleChatAreaClick}
            deletingId={ai.deletingId}
            handleStop={ai.stopStream}
            handleRegenerate={ai.regenerate}
            handleEditUserMsg={ai.editUserMsg}
            memoryModalOpen={mem.open}
            setMemoryModalOpen={mem.setOpen}
            aiMemory={mem.memory}
            saveMemory={mem.save}
            savingMemory={mem.saving}
            attachedFiles={attachedFiles}
            isUploadingFile={isUploadingFile}
            fileInputRef={fileInputRef}
            handleFileChange={handleFileChange}
            removeAttachedFile={removeAttachedFile}
        />
    );
}
