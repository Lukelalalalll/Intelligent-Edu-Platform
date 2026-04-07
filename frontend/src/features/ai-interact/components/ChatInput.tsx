import React from 'react';
import styles from '../styles/AIInteract.module.css';

export default function ChatInput({
    inputText, handleInput, handleKeyDown, handleSend, isTyping, inputRef,
    attachedFiles, isUploadingFile, fileInputRef, handleFileChange, removeAttachedFile, handleStop
}) {
    return (
        <div className={styles['input-area']}>
            {/* 附件功能暂未接入后端推理 —— 隐藏附件预览与按钮 */}

            <div className={styles['input-wrapper']} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {/* Attachment button hidden: file uploads are not yet processed by the AI backend.
                    Uncomment when the backend attachment pipeline (upload → parse → RAG) is implemented. */}
                <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    accept="image/*,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={handleFileChange}
                    disabled
                />

                {/* Attachment button disabled — feature not yet connected to backend
                <button
                    type="button"
                    style={{
                        background: 'none', border: 'none', fontSize: '20px', color: '#6b7280',
                        cursor: 'not-allowed',
                        padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'color 0.2s',
                        opacity: 0.4,
                    }}
                    disabled
                    title="File attachment coming soon"
                >
                    <i className="fas fa-paperclip"></i>
                </button>
                */}

                <textarea
                    className={styles['workspace-input']}
                    ref={inputRef} rows={1}
                    placeholder="Type your academic query or attach a file... (Press Enter to send)"
                    value={inputText} onChange={handleInput} onKeyDown={handleKeyDown}
                    data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false"
                    style={{ flex: 1 }}
                />

                <button className={styles['send-btn']} onClick={handleSend} disabled={isTyping || isUploadingFile}>
                    <i className="fas fa-paper-plane"></i>
                </button>

                <button className={styles['stop-btn']} onClick={handleStop} disabled={!isTyping} title="Stop AI output">
                    <i className="fas fa-stop"></i>
                </button>
            </div>
            <div className={styles['input-footer-text']}>
                AI can make mistakes. Consider verifying important academic information.
            </div>
        </div>
    );
}