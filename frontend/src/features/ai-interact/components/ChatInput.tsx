import React from 'react';
import styles from '../styles/AIInteract.module.css';

export default function ChatInput({
    inputText, handleInput, handleKeyDown, handleSend, isTyping, inputRef,
    attachedFiles, isUploadingFile, fileInputRef, handleFileChange, removeAttachedFile, handleStop
}) {
    const getFileIcon = (file: File) => {
        const mimeType = file.type;
        if (!mimeType) return 'fa-file-alt';
        if (mimeType.startsWith('image/')) return 'fa-file-image';
        if (mimeType === 'application/pdf') return 'fa-file-pdf';
        if (mimeType.includes('word') || mimeType.includes('document')) return 'fa-file-word';
        if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'fa-file-excel';
        if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return 'fa-file-powerpoint';
        if (mimeType.includes('zip') || mimeType.includes('compressed') || mimeType.includes('tar')) return 'fa-file-archive';
        if (mimeType.includes('markdown') || mimeType.includes('text/md')) return 'fa-file-code';
        return 'fa-file-alt';
    };

    return (
        <div className={styles['input-area']}>
            {/* Attachment preview */}
            {attachedFiles && attachedFiles.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', paddingBottom: '8px', flexWrap: 'wrap' }}>
                    {attachedFiles.map((fileObj, idx) => {
                        const file = fileObj?.file instanceof File ? fileObj.file : fileObj;
                        return (
                            <div key={idx} className={styles.fileCard} style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', maxWidth: '200px', cursor: 'default' }}>
                                <i className={`fas ${getFileIcon(file)} ${styles.fileCardIcon}`} style={{ fontSize: '1.2rem' }}></i>
                                <div className={styles.fileCardInfo}>
                                    <span className={styles.fileCardName}>{file.name}</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={(e) => { e.preventDefault(); removeAttachedFile(idx); }}
                                    style={{ background: 'none', border: 'none', marginLeft: 'auto', paddingLeft: '4px', cursor: 'pointer', color: '#ff4d4f' }}
                                    title="Remove attachment"
                                >
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className={styles['input-wrapper']} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                    style={{
                        background: 'none', border: 'none', fontSize: '20px', color: '#6b7280',
                        cursor: 'pointer',
                        padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'color 0.2s',
                    }}
                    title="Attach File"
                >
                    <i className="fas fa-paperclip"></i>
                </button>

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