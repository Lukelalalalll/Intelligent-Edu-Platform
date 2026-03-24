import React from 'react';
import styles from '../../../styles/AIInteract.module.css';

export default function ChatInput({
    inputText, handleInput, handleKeyDown, handleSend, isTyping, inputRef,
    attachedFiles, isUploadingFile, fileInputRef, handleFileChange, removeAttachedFile, handleStop
}) {
    return (
        <div className={styles['input-area']}>
            {/* 附件预览区 */}
            {attachedFiles && attachedFiles.length > 0 && (
                <div style={{ display: 'flex', gap: '10px', padding: '0 15px 10px', flexWrap: 'wrap' }}>
                    {attachedFiles.map((file, idx) => (
                        <div key={idx} style={{
                            background: '#f1f3f5', padding: '6px 12px', borderRadius: '16px', fontSize: '13px',
                            display: 'flex', alignItems: 'center', gap: '8px', color: '#333', border: '1px solid #dee2e6'
                        }}>
                            <i className={file.mime_type.startsWith('image') ? 'fas fa-image' : 'fas fa-file-alt'} style={{ color: '#007B55' }}></i>
                            <span style={{ maxWidth: '180px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {file.file_name}
                            </span>
                            <i className="fas fa-times"
                                style={{ cursor: 'pointer', color: '#868e96', marginLeft: '4px' }}
                                onClick={() => removeAttachedFile(idx)}
                                title="Remove attachment"
                            ></i>
                        </div>
                    ))}
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
                    style={{
                        background: 'none', border: 'none', fontSize: '20px', color: '#6b7280',
                        cursor: isTyping || isUploadingFile ? 'not-allowed' : 'pointer',
                        padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'color 0.2s'
                    }}
                    onClick={() => fileInputRef.current && fileInputRef.current.click()}
                    disabled={isTyping || isUploadingFile}
                    title="Attach File (Image, PDF, DOCX)"
                >
                    {isUploadingFile ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-paperclip"></i>}
                </button>

                <textarea
                    className={styles['workspace-input']}
                    ref={inputRef} rows="1"
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