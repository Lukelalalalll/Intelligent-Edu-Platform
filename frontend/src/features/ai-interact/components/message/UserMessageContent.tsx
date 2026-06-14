import React, { memo, useCallback, useState } from 'react';
import styles from '../../styles/AIMessage.module.css';
import { getFileIcon, getFileIconColor } from '../../utils/fileUtils';

interface UserMessageContentProps {
    content: string;
    images?: string[];
    files?: Array<{ file_name: string; mime_type: string }>;
    isTyping: boolean;
    onEdit: (value: string) => void;
}

function UserMessageContent({
    content,
    images,
    files,
    isTyping,
    onEdit,
}: UserMessageContentProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(content);

    const handleSave = useCallback(() => {
        const trimmed = editValue.trim();
        if (!trimmed) {
            return;
        }

        onEdit(trimmed);
        setIsEditing(false);
    }, [editValue, onEdit]);

    const handleCancel = useCallback(() => {
        setEditValue(content);
        setIsEditing(false);
    }, [content]);

    return (
        <div className={styles.bubble} style={{ minHeight: '20px', position: 'relative' }}>
            {images && images.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                    {images.map((base64, index) => (
                        <img
                            key={index}
                            src={`data:image/jpeg;base64,${base64}`}
                            alt="attachment"
                            loading="lazy"
                            decoding="async"
                            style={{
                                maxWidth: '200px',
                                maxHeight: '200px',
                                borderRadius: '6px',
                                objectFit: 'contain',
                                background: 'rgba(255,255,255,0.2)',
                            }}
                        />
                    ))}
                </div>
            )}

            {files && files.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: content ? '8px' : '0' }}>
                    {files.map((file, index) => {
                        const iconColorClass = styles[getFileIconColor(file.mime_type)] || '';
    return (
                            <div key={index} className={styles.fileCard} title={file.file_name}>
                                <div className={`${styles.fileCardIconWrap} ${iconColorClass}`}>
                                    <i className={`fas ${getFileIcon(file.mime_type)}`}></i>
                                </div>
                                <div className={styles.fileCardInfo}>
                                    <span className={styles.fileCardName}>{file.file_name}</span>
                                    <span className={styles.fileCardSize}>Document</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {isEditing ? (
                <div className={styles['edit-box']}>
                    <textarea
                        value={editValue}
                        onChange={(event) => setEditValue(event.target.value)}
                        autoFocus
                        className={styles['edit-textarea']}
                        rows={Math.max(2, editValue.split('\n').length)}
                    />
                    <div className={styles['edit-actions']}>
                        <button className={styles['edit-btn-cancel']} onClick={handleCancel}>Cancel</button>
                        <button
                            className={styles['edit-btn-save']}
                            onClick={handleSave}
                            disabled={!editValue.trim()}
                        >
                            <i className="fas fa-paper-plane"></i> Save & Resend
                        </button>
                    </div>
                </div>
            ) : (
                <div className={styles['message-content-display']}>
                    {content}
                    {!isTyping && (
                        <div className={styles['user-message-actions']}>
                            <button className={styles['msg-action-btn']} onClick={() => setIsEditing(true)}>
                                <i className="fas fa-edit"></i>
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default memo(UserMessageContent);
