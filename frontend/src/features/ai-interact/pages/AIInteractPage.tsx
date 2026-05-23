import React, { useState, useEffect, useRef, useCallback } from 'react';
import AIInteract from '../components/AIInteractDashboard';
import { usePretextMeasure } from '@/shared/hooks/usePretextMeasure';
import { useAISessions, useAIMemory } from '../hooks/useAISessions/useAISessions';
import { getRoleInfo, type AIRoleInfo } from '../api/aiApi';

export default function AIInteractPage() {
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
    const chatMessagesRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [attachedFiles, setAttachedFiles] = useState<Array<{ file: File; file_name: string; mime_type: string }>>([]);
    const [isUploadingFile, setIsUploadingFile] = useState(false);

    // Scroll management
    const { scrollToBottom } = usePretextMeasure(chatMessagesRef, {
        font: '16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        lineHeight: 25.6,
        debounceMs: 60,
    });

    // Scroll on new messages only — NOT on every streaming token update
    const prevMsgCountRef = useRef(-1);
    useEffect(() => {
        const currentSession = ai.sessions?.find(s => s.id === ai.currentSessionId);
        const count = currentSession?.messages.length ?? 0;
        if (count !== prevMsgCountRef.current) {
            prevMsgCountRef.current = count;
            scrollToBottom(true);
        }
    }, [ai.sessions, ai.currentSessionId, scrollToBottom]);

    // Input handling
    const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInputText(e.target.value);
        e.target.style.height = 'auto';
        e.target.style.height = e.target.scrollHeight + 'px';
    }, []);

    // Stable refs to avoid breaking memo on every keystroke
    const inputTextRef = useRef(inputText);
    inputTextRef.current = inputText;
    const attachedFilesRef = useRef(attachedFiles);
    attachedFilesRef.current = attachedFiles;

    const handleSend = useCallback(() => {
        const text = inputTextRef.current;
        const files = attachedFilesRef.current;
        if (!text.trim() && files.length === 0) return;
        ai.sendMessage(text, files);
        setInputText('');
        setAttachedFiles([]);
        if (inputRef.current) inputRef.current.style.height = 'auto';
    }, [ai.sendMessage]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    }, [handleSend]);

    // Clipboard
    const showToast = useCallback(() => { setToastVisible(true); setTimeout(() => setToastVisible(false), 2500); }, []);

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

    // File attachments
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

    // Stable wrappers for hook methods — avoid inline lambdas in JSX
    const switchSession = useCallback((id: string) => ai.setCurrentSessionId(id), [ai.setCurrentSessionId]);
    const deleteSession = useCallback((id: string) => ai.setModalConfig({ show: true, sessionId: id }), [ai.setModalConfig]);
    const handleStop = useCallback(() => ai.stopStream(), [ai.stopStream]);
    const handleRegenerate = useCallback((msgId: number) => ai.regenerate(msgId), [ai.regenerate]);
    const handleEditUserMsg = useCallback((msgId: number, content: string) => ai.editUserMsg(msgId, content), [ai.editUserMsg]);

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
            switchSession={switchSession}
            deleteSession={deleteSession}
            confirmDelete={ai.confirmDelete}
            setModalConfig={ai.setModalConfig}
            handleInput={handleInput}
            handleKeyDown={handleKeyDown}
            handleSend={handleSend}
            copyToClipboard={copyToClipboard}
            handleChatAreaClick={handleChatAreaClick}
            deletingId={ai.deletingId}
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
            selectedProvider={ai.selectedProvider}
            setSelectedProvider={ai.setSelectedProvider}
            providerHealth={ai.providerHealth}
            tutorMode={ai.tutorMode}
            setTutorMode={ai.setTutorMode}
            webSearch={ai.webSearch}
            setWebSearch={ai.setWebSearch}
            searchEngine={ai.searchEngine}
            setSearchEngine={ai.setSearchEngine}
            enableThinking={ai.enableThinking}
            setEnableThinking={ai.setEnableThinking}
        />
    );
}
