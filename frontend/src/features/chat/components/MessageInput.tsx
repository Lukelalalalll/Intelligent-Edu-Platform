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

const REWRITE_STYLES = [
    { value: 'concise', label: 'Concise', icon: 'fa-compress-alt' },
    { value: 'polite', label: 'Polite', icon: 'fa-handshake' },
    { value: 'professional', label: 'Professional', icon: 'fa-briefcase' },
    { value: 'assertive', label: 'Assertive', icon: 'fa-bolt' },
    { value: 'friendly', label: 'Friendly', icon: 'fa-smile' },
];

export default function MessageInput({ roomId, onSend, onTyping, quotedMessage, onClearQuote }: Props) {
    const [text, setText] = useState('');
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // AI features
    const [rewriting, setRewriting] = useState(false);
    const [showRewriteMenu, setShowRewriteMenu] = useState(false);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);

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
            setUploadError(null);
            try {
                const meta = await chatApi.uploadFile(roomId, pendingFile);
                onSend(pendingFile.name, { ...meta, messageType: 'file' });
                setPendingFile(null);
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : 'Upload failed';
                setUploadError(msg);
            } finally {
                setUploading(false);
            }
            return;
        }
        const trimmed = text.trim();
        if (!trimmed) return;
        onSend(trimmed);
        setText('');
        setSuggestions([]);
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

    // AI Rewrite
    const handleRewrite = useCallback(async (style: string) => {
        setShowRewriteMenu(false);
        if (!text.trim()) return;
        setRewriting(true);
        try {
            const res = await chatApi.aiRewrite(roomId, text.trim(), style);
            setText(res.rewritten_text);
        } catch {
            // silently ignore
        } finally {
            setRewriting(false);
        }
    }, [roomId, text]);

    // AI Reply Suggestions
    const handleGetSuggestions = useCallback(async () => {
        setLoadingSuggestions(true);
        try {
            const res = await chatApi.aiReplySuggestions(roomId);
            setSuggestions(res.suggestions);
        } catch {
            // silently ignore
        } finally {
            setLoadingSuggestions(false);
        }
    }, [roomId]);

    const handleUseSuggestion = useCallback((s: string) => {
        setText(s);
        setSuggestions([]);
    }, []);

    return (
        <div className={styles.messageInputWrapper}>
            {/* Reply suggestions chips */}
            {suggestions.length > 0 && (
                <div className={styles.suggestionsBar}>
                    {suggestions.map((s, i) => (
                        <button
                            key={i}
                            className={styles.suggestionChip}
                            onClick={() => handleUseSuggestion(s)}
                        >
                            {s}
                        </button>
                    ))}
                    <button
                        className={styles.suggestionChipDismiss}
                        onClick={() => setSuggestions([])}
                        title="Dismiss"
                    >
                        <i className="fas fa-times" />
                    </button>
                </div>
            )}

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
            {uploadError && (
                <div style={{ padding: '4px 12px', color: '#ef4444', fontSize: '0.8rem', background: '#fef2f2', borderRadius: 4 }}>
                    <i className="fas fa-exclamation-circle" style={{ marginRight: 4 }} />
                    {uploadError}
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

                {/* AI Suggest button */}
                <button
                    className={styles.aiInputBtn}
                    onClick={handleGetSuggestions}
                    disabled={loadingSuggestions || uploading}
                    title="Get AI reply suggestions"
                >
                    {loadingSuggestions
                        ? <i className="fas fa-circle-notch fa-spin" />
                        : <i className="fas fa-lightbulb" />}
                </button>

                <input
                    className={styles.messageInput}
                    placeholder={pendingFile ? 'Add a message (optional)...' : 'Type a message...'}
                    value={text}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    disabled={uploading || rewriting}
                />

                {/* AI Rewrite button with dropdown */}
                <div style={{ position: 'relative' }}>
                    <button
                        className={styles.aiInputBtn}
                        onClick={() => setShowRewriteMenu(!showRewriteMenu)}
                        disabled={!text.trim() || rewriting || uploading}
                        title="AI Rewrite"
                    >
                        {rewriting
                            ? <i className="fas fa-circle-notch fa-spin" />
                            : <i className="fas fa-magic" />}
                    </button>
                    {showRewriteMenu && (
                        <div className={styles.rewriteDropdown}>
                            {REWRITE_STYLES.map((s) => (
                                <button
                                    key={s.value}
                                    className={styles.rewriteDropdownItem}
                                    onClick={() => handleRewrite(s.value)}
                                >
                                    <i className={`fas ${s.icon}`} /> {s.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

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
