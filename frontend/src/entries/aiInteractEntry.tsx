import React, { useState, useEffect, useRef, useCallback } from 'react';
import AIInteract from '../features/ai-interact/index';
import { usePretextMeasure } from '../hooks/usePretextMeasure';
import { useAISessions, useAIMemory } from '../hooks/useAISessions';
import { getRoleInfo, type AIRoleInfo } from '../api/aiApi';

export default function AIInteractEntry() {
    // Business logic from hooks
    const ai = useAISessions();
    const mem = useAIMemory();

    // Role info
    const [roleInfo, setRoleInfo] = useState<AIRoleInfo | null>(null);
    useEffect(() => {
        getRoleInfo().then(setRoleInfo).catch(() => {});
    }, []);

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

    const copyToClipboard = useCallback(async (text, buttonEl = null) => {
        try {
            await navigator.clipboard.writeText(text);
            showToast();
        } catch (err) {
            console.error('Clipboard write failed', err);
            return;
        }

        if (buttonEl instanceof HTMLElement) {
            const orig = buttonEl.innerHTML;
            buttonEl.innerHTML = '<i class="fas fa-check" style="color:#27c93f;"></i> Copied!';
            setTimeout(() => {
                buttonEl.innerHTML = orig;
            }, 2000);
        }
    }, [showToast]);

    const handleChatAreaClick = useCallback((e: React.MouseEvent) => {
        const btn = (e.target as HTMLElement).closest('.js-code-copy-btn') as HTMLElement | null;
        if (!btn) return;
        const encoded = btn.dataset.code || '';
        copyToClipboard(decodeURIComponent(encoded), btn);
    }, [copyToClipboard]);

    // File attachments
    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        setAttachedFiles(prev => [...prev, ...files.map((f: File) => ({ file: f, file_name: f.name, mime_type: f.type }))]);
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
            deleteSession={(id: string) => ai.setModalConfig({ show: true, sessionId: id })}
            confirmDelete={ai.confirmDelete}
            setModalConfig={ai.setModalConfig}
            handleInput={handleInput}
            handleKeyDown={handleKeyDown}
            handleSend={handleSend}
            copyToClipboard={copyToClipboard}
            handleChatAreaClick={handleChatAreaClick}
            deletingId={ai.deletingId}
            handleStop={() => ai.stopStream()}
            handleRegenerate={(msgId: string) => ai.regenerate(Number(msgId))}
            handleEditUserMsg={(msgId: string, content: string) => ai.editUserMsg(Number(msgId), content)}
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
            roleInfo={roleInfo}
        />
    );
}
