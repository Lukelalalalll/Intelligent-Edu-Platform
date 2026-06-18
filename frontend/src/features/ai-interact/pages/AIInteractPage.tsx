import React, { useState, useEffect, useRef, useCallback } from 'react';
import AIInteract from '../components/AIInteractDashboard';
import { usePretextMeasure } from '@/shared/hooks/usePretextMeasure';
import { useAISessions, useAIMemory } from '../hooks/useAISessions/useAISessions';
import { getRoleInfo, type AIRoleInfo } from '../api/aiApi';

export default function AIInteractPage() {
    const {
        sessions,
        currentSessionId,
        isTyping,
        modalConfig,
        createNewSession,
        setCurrentSessionId,
        setModalConfig,
        confirmDelete,
        sendMessage,
        deletingId,
        stopStream,
        regenerate,
        editUserMsg,
        selectedProvider,
        setSelectedProvider,
        providerHealth,
        setShouldCheckHealth,
        tutorMode,
        setTutorMode,
        webSearch,
        setWebSearch,
        searchEngine,
        setSearchEngine,
        enableThinking,
        setEnableThinking,
    } = useAISessions();
    const mem = useAIMemory();

    const [roleInfo, setRoleInfo] = useState<AIRoleInfo | null>(null);
    useEffect(() => {
        const schedule = window.requestIdleCallback
            ? window.requestIdleCallback
            : (cb: IdleRequestCallback) => window.setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 0 } as IdleDeadline), 250);
        const cancel = window.cancelIdleCallback
            ? window.cancelIdleCallback
            : window.clearTimeout;

        const id = schedule(() => {
            getRoleInfo().then(setRoleInfo).catch(() => {});
            setShouldCheckHealth(true);
        });
        return () => cancel(id);
    }, [setShouldCheckHealth]);

    const [inputText, setInputText] = useState('');
    const [toastVisible, setToastVisible] = useState(false);
    const chatMessagesRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [attachedFiles, setAttachedFiles] = useState<Array<{ file: File; file_name: string; mime_type: string }>>([]);
    const [isUploadingFile, setIsUploadingFile] = useState(false);

    const inputTextRef = useRef(inputText);
    const attachedFilesRef = useRef(attachedFiles);

    useEffect(() => {
        inputTextRef.current = inputText;
    }, [inputText]);

    useEffect(() => {
        attachedFilesRef.current = attachedFiles;
    }, [attachedFiles]);

    const { scrollToBottom } = usePretextMeasure(chatMessagesRef, {
        font: '16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        lineHeight: 25.6,
        debounceMs: 60,
    });

    const prevMsgCountRef = useRef(-1);
    useEffect(() => {
        const currentSession = sessions?.find(s => s.id === currentSessionId);
        const count = currentSession?.messages.length ?? 0;
        if (count !== prevMsgCountRef.current) {
            prevMsgCountRef.current = count;
            scrollToBottom(true);
        }
    }, [sessions, currentSessionId, scrollToBottom]);

    const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInputText(e.target.value);
        e.target.style.height = 'auto';
        e.target.style.height = e.target.scrollHeight + 'px';
    }, []);

    const handleSend = useCallback(() => {
        const text = inputTextRef.current;
        const files = attachedFilesRef.current;
        if (!text.trim() && files.length === 0) return;
        sendMessage(text, files);
        setInputText('');
        setAttachedFiles([]);
        if (inputRef.current) inputRef.current.style.height = 'auto';
    }, [sendMessage]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    }, [handleSend]);

    const showToast = useCallback(() => {
        setToastVisible(true);
        setTimeout(() => setToastVisible(false), 2500);
    }, []);

    const copyToClipboard = useCallback(async (text: string, buttonEl: HTMLElement | null = null) => {
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

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        setIsUploadingFile(true);
        setAttachedFiles(prev => [...prev, ...files.map((f: File) => ({ file: f, file_name: f.name, mime_type: f.type }))]);
        if (fileInputRef.current) fileInputRef.current.value = '';
        setIsUploadingFile(false);
    }, []);

    const removeAttachedFile = useCallback((idx: number) => {
        setAttachedFiles(prev => prev.filter((_, i) => i !== idx));
    }, []);

    const switchSession = useCallback((id: string) => setCurrentSessionId(id), [setCurrentSessionId]);
    const deleteSession = useCallback((id: string) => setModalConfig({ show: true, sessionId: id }), [setModalConfig]);
    const handleStop = useCallback(() => stopStream(), [stopStream]);
    const handleRegenerate = useCallback((msgId: number) => regenerate(msgId), [regenerate]);
    const handleEditUserMsg = useCallback((msgId: number, content: string) => editUserMsg(msgId, content), [editUserMsg]);

    return (
        <AIInteract
            sessions={sessions}
            currentSessionId={currentSessionId}
            inputText={inputText}
            isTyping={isTyping}
            modalConfig={modalConfig}
            toastVisible={toastVisible}
            chatMessagesRef={chatMessagesRef}
            inputRef={inputRef}
            createNewSession={createNewSession}
            switchSession={switchSession}
            deleteSession={deleteSession}
            confirmDelete={confirmDelete}
            setModalConfig={setModalConfig}
            handleInput={handleInput}
            handleKeyDown={handleKeyDown}
            handleSend={handleSend}
            copyToClipboard={copyToClipboard}
            handleChatAreaClick={handleChatAreaClick}
            deletingId={deletingId}
            handleStop={handleStop}
            handleRegenerate={handleRegenerate}
            handleEditUserMsg={handleEditUserMsg}
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
            selectedProvider={selectedProvider}
            setSelectedProvider={setSelectedProvider}
            providerHealth={providerHealth}
            tutorMode={tutorMode}
            setTutorMode={setTutorMode}
            webSearch={webSearch}
            setWebSearch={setWebSearch}
            searchEngine={searchEngine}
            setSearchEngine={setSearchEngine}
            enableThinking={enableThinking}
            setEnableThinking={setEnableThinking}
        />
    );
}
