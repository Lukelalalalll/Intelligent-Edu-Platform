// frontend/src/features/chat/components/MessageInput.tsx

import React, { useState, useRef, useCallback } from 'react';
import styles from '../styles/Chat.module.css';
import { chatApi } from '../../../api/chatApi';
import type { ChatMessage } from '../types';

interface Props {
    roomId: string;
    onSend: (content: string, fileData?: { fileUrl: string; fileName: string; fileSize: number; mimeType: string; messageType: 'file' }) => void;
    onTyping: () => void;
    quotedMessage?: ChatMessage | null;
    onClearQuote?: () => void;
}

export default function MessageInput({ roomId, onSend, onTyping, quotedMessage, onClearQuote }: Props) {
    const [text, setText] = useState('');
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            setText(e.target.value);
            if (typingTimeout.current) clearTimeout(typingTimeout.current);
            typingTimeout.current = setTimeout(onTyping, 400);
        },
        [onTyping],
    );

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) setPendingFile(file);
        e.target.value = '';
    };

    const handleSend = useCallback(async () => {
        if (pendingFile) {
            setUploading(true);
            try {
                const meta = await chatApi.uploadFile(roomId, pendingFile);
                onSend(pendingFile.name, { ...meta, messageType: 'file' });
            } finally {
                setUploading(false);
                setPendingFile(null);
            }
            return;
        }
        const trimmed = text.trim();
        if (!trimmed) return;
        onSend(trimmed);
        setText('');
    }, [text, pendingFile, roomId, onSend]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        },
        [handleSend],
    );

    return (
        <div className={styles.messageInputWrapper}>
            {quotedMessage && (
                <div className={styles.quotePreview}>
                    <div className={styles.quotePreviewBar} />
                    <div className={styles.quotePreviewContent}>
                        <div className={styles.quotePreviewName}>{quotedMessage.senderName}</div>
                        <div className={styles.quotePreviewText}>
                            {quotedMessage.messageType === 'file'
                                ? `📎 ${quotedMessage.fileName || 'File'}`
                                : (quotedMessage.content || '').slice(0, 100)}
                        </div>
                    </div>
                    <button className={styles.quotePreviewClose} onClick={onClearQuote}>
                        <i className="fas fa-times" />
                    </button>
                </div>
            )}
            {pendingFile && (
                <div className={styles.filePreviewBar}>
                    <i className="fas fa-paperclip" style={{ marginRight: 6 }} />
                    <span className={styles.filePreviewName}>{pendingFile.name}</span>
                    <span className={styles.filePreviewSize}>
                        {pendingFile.size < 1024 * 1024
                            ? `${(pendingFile.size / 1024).toFixed(1)} KB`
                            : `${(pendingFile.size / 1024 / 1024).toFixed(1)} MB`}
                    </span>
                    <button className={styles.filePreviewRemove} onClick={() => setPendingFile(null)}>
                        <i className="fas fa-times" />
                    </button>
                </div>
            )}
            <div className={styles.messageInputBar}>
                <input
                    ref={fileInputRef}
                    type="file"
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                />
                <button
                    className={styles.attachBtn}
                    onClick={() => fileInputRef.current?.click()}
                    title="Attach file"
                    disabled={uploading}
                >
                    <i className="fas fa-paperclip" />
                </button>
                <input
                    className={styles.messageInput}
                    placeholder={pendingFile ? 'Add a message (optional)...' : 'Type a message...'}
                    value={text}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    disabled={uploading}
                />
                <button
                    className={styles.sendBtn}
                    onClick={handleSend}
                    disabled={(!text.trim() && !pendingFile) || uploading}
                    title={uploading ? 'Uploading...' : 'Send'}
                >
                    {uploading
                        ? <i className="fas fa-circle-notch fa-spin" />
                        : <i className="fas fa-paper-plane" />}
                </button>
            </div>
        </div>
    );
}
