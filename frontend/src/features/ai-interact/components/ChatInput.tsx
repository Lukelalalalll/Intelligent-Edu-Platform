import React, { memo, useRef, useState, useEffect } from 'react';
import aiStyles from '../styles/AIInteract.module.css';
import styles from '../styles/ChatInput.module.css';
import { getFileIcon, getFileIconColor, formatFileSize } from '../utils/fileUtils';
import { type AISearchEngine, SEARCH_ENGINE_LABELS } from '../api/aiApi';

interface AttachedFileObject {
    file: File;
    file_name: string;
    mime_type: string;
}

interface ChatInputProps {
    inputText: string;
    handleInput: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
    handleSend: () => void;
    isTyping: boolean;
    inputRef: React.RefObject<HTMLTextAreaElement>;
    attachedFiles: AttachedFileObject[];
    isUploadingFile: boolean;
    fileInputRef: React.RefObject<HTMLInputElement>;
    handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    removeAttachedFile: (index: number) => void;
    handleStop: () => void;
    // Web search
    webSearch?: boolean;
    setWebSearch?: (v: boolean) => void;
    searchEngine?: AISearchEngine;
    setSearchEngine?: (e: AISearchEngine) => void;
    // Deep Think
    selectedProvider?: import('../api/aiApi').AIProvider;
    enableThinking?: boolean;
    setEnableThinking?: (v: boolean) => void;
}

function ChatInput({
    inputText, handleInput, handleKeyDown, handleSend, isTyping, inputRef,
    attachedFiles, isUploadingFile, fileInputRef, handleFileChange, removeAttachedFile, handleStop,
    webSearch = false, setWebSearch, searchEngine = 'auto', setSearchEngine,
    selectedProvider, enableThinking = false, setEnableThinking,
}: ChatInputProps) {
    const [engineOpen, setEngineOpen] = useState(false);
    const engineMenuRef = useRef<HTMLDivElement>(null);

    // Close engine dropdown on outside click
    useEffect(() => {
        if (!engineOpen) return;
        const handler = (e: MouseEvent) => {
            if (engineMenuRef.current && !engineMenuRef.current.contains(e.target as Node)) {
                setEngineOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [engineOpen]);

    const handleToggleWeb = () => setWebSearch?.(!webSearch);
    const handleSelectEngine = (e: AISearchEngine) => {
        setSearchEngine?.(e);
        setEngineOpen(false);
    };
    const showThinkingToggle = selectedProvider === 'deepseek';
    const handleToggleThinking = () => setEnableThinking?.(!enableThinking);

    return (
        <div className={aiStyles['input-area']}>
            {/* Attachment preview */}
            {attachedFiles && attachedFiles.length > 0 && (
                <div className={styles.attachmentPreview}>
                    {attachedFiles.map((fileObj, idx) => {
                        const file = fileObj?.file instanceof File ? fileObj.file : fileObj as unknown as File;
                        const iconColorClass = styles[getFileIconColor(file.type)] || '';
                        return (
                            <div key={idx} className={styles.fileCard} title={file.name}>
                                <div className={`${styles.fileCardIconWrap} ${iconColorClass}`}>
                                    <i className={`fas ${getFileIcon(file.type)}`}></i>
                                </div>
                                <div className={styles.fileCardInfo}>
                                    <span className={styles.fileCardName}>{file.name}</span>
                                    <span className={styles.fileCardMeta}>{formatFileSize(file.size)}</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={(e) => { e.preventDefault(); removeAttachedFile(idx); }}
                                    className={styles.attachmentRemoveBtn}
                                    title="Remove attachment"
                                >
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Web search toolbar ─────────────────────────────── */}
            <div className={styles.webSearchBar}>
                {/* Toggle button */}
                <button
                    type="button"
                    className={`${styles.webToggleBtn} ${webSearch ? styles.webToggleBtnActive : ''}`}
                    onClick={handleToggleWeb}
                    title={webSearch ? 'Disable web search' : 'Enable web search (SearXNG)'}
                >
                    <i className={`fas fa-globe`}></i>
                    <span>{webSearch ? 'Web On' : 'Web'}</span>
                </button>

                {/* Deep Think toggle — only visible when DeepSeek is selected */}
                {showThinkingToggle && (
                    <button
                        type="button"
                        className={`${styles.webToggleBtn} ${enableThinking ? styles.thinkingToggleActive : ''}`}
                        onClick={handleToggleThinking}
                        title={enableThinking ? 'Disable Deep Think (R1)' : 'Enable Deep Think (R1)'}
                    >
                        <i className="fas fa-brain"></i>
                        <span>{enableThinking ? 'Deep Think' : 'Think'}</span>
                    </button>
                )}

                {/* Engine selector — only visible when web search is on */}
                {webSearch && (
                    <div className={styles.engineSelector} ref={engineMenuRef}>
                        <button
                            type="button"
                            className={styles.engineTrigger}
                            onClick={() => setEngineOpen(v => !v)}
                            title="Choose search engine"
                        >
                            <span>{SEARCH_ENGINE_LABELS[searchEngine]}</span>
                            <i className={`fas fa-chevron-${engineOpen ? 'up' : 'down'}`}></i>
                        </button>

                        {engineOpen && (
                            <div className={styles.engineDropdown}>
                                {(Object.entries(SEARCH_ENGINE_LABELS) as [AISearchEngine, string][]).map(([key, label]) => (
                                    <button
                                        key={key}
                                        type="button"
                                        className={`${styles.engineOption} ${searchEngine === key ? styles.engineOptionActive : ''}`}
                                        onClick={() => handleSelectEngine(key)}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className={aiStyles['input-wrapper']}>
                <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    accept="image/*,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={handleFileChange}
                />

                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={styles.attachBtn}
                    title="Attach File"
                >
                    <i className="fas fa-paperclip"></i>
                </button>

                <textarea
                    className={aiStyles['workspace-input']}
                    ref={inputRef}
                    rows={1}
                    placeholder="Type your academic query or attach a file... (Press Enter to send)"
                    value={inputText}
                    onChange={handleInput}
                    onKeyDown={handleKeyDown}
                    data-gramm="false"
                    data-gramm_editor="false"
                    data-enable-grammarly="false"
                />

                <button className={aiStyles['send-btn']} onClick={handleSend} disabled={isTyping || isUploadingFile}>
                    <i className="fas fa-paper-plane"></i>
                </button>

                <button className={aiStyles['stop-btn']} onClick={handleStop} disabled={!isTyping} title="Stop AI output">
                    <i className="fas fa-stop"></i>
                </button>
            </div>
            <div className={aiStyles['input-footer-text']}>
                AI can make mistakes. Consider verifying important academic information.
            </div>
        </div>
    );
}

export default memo(ChatInput);
