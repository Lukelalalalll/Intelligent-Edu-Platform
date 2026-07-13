import React, { useEffect, useRef, useState } from 'react';
import globalStyles from '../styles/globals.module.css';
import layoutStyles from '../styles/components/ChatLayout.module.css';
import sidebarStyles from '../styles/components/Sidebar.module.css';
import headerStyles from '../styles/components/ChatHeader.module.css';
import messageListStyles from '../styles/components/MessageList.module.css';
import messageInputStyles from '../styles/components/MessageInput.module.css';
import messageBubbleStyles from '../styles/components/MessageBubble.module.css';
import modalStyles from '../styles/components/ContextMenu.module.css';
import { chatApi } from '../api';

const styles = {
    ...globalStyles,
    ...layoutStyles,
    ...sidebarStyles,
    ...headerStyles,
    ...messageListStyles,
    ...messageInputStyles,
    ...messageBubbleStyles,
    ...modalStyles,
};

interface Props {
    x: number;
    y: number;
    anchorRect?: { top: number; left: number; right: number; bottom: number; width: number; height: number };
    preferredSide?: 'left' | 'right';
    isOwn: boolean;
    canRecall: boolean;
    messageContent: string;
    messageId: string;
    onClose: () => void;
    onCopy: () => void;
    onQuote: () => void;
    onRecall: () => void;
    onMultiSelect: () => void;
    onAiRewrite?: (text: string) => void;
}

const LANG_OPTIONS = [
    { code: 'zh', label: '中文' },
    { code: 'en', label: 'English' },
    { code: 'ja', label: '日本語' },
    { code: 'ko', label: '한국어' },
    { code: 'fr', label: 'Français' },
    { code: 'de', label: 'Deutsch' },
    { code: 'es', label: 'Español' },
];

export default function MessageContextMenu({
    x, y, anchorRect, preferredSide, isOwn, canRecall, messageContent, messageId,
    onClose, onCopy, onQuote, onRecall, onMultiSelect, onAiRewrite,
}: Props) {
    const menuRef = useRef<HTMLDivElement>(null);
    const [showTranslateSub, setShowTranslateSub] = useState(false);
    const [translating, setTranslating] = useState(false);
    const [translated, setTranslated] = useState<string | null>(null);

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [onClose]);

    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    // Adjust position to keep menu beside the bubble and within viewport.
    const adjustedStyle = (() => {
        const menuW = Math.max(menuRef.current?.offsetWidth ?? 0, 180);
        const menuH = Math.max(menuRef.current?.offsetHeight ?? 0, 220);
        const GAP = 8;

        let left = x;
        if (anchorRect) {
            const side = preferredSide ?? (isOwn ? 'left' : 'right');
            left = side === 'left'
                ? anchorRect.left - menuW - GAP
                : anchorRect.right + GAP;

            if (left < 8) {
                left = Math.min(window.innerWidth - menuW - 8, anchorRect.right + GAP);
            }
            if (left + menuW > window.innerWidth - 8) {
                left = Math.max(8, anchorRect.left - menuW - GAP);
            }
        }

        let top = anchorRect
            ? anchorRect.top + anchorRect.height / 2 - menuH / 2
            : y - menuH / 2;

        if (top + menuH > window.innerHeight - 8) top = window.innerHeight - menuH - 8;
        if (top < 8) top = 8;

        return { left, top };
    })();

    const handleTranslate = async (lang: string) => {
        setTranslating(true);
        setShowTranslateSub(false);
        try {
            const res = await chatApi.translateMessage(messageContent, lang);
            setTranslated(res.translated);
        } catch {
            setTranslated('[Translation failed]');
        } finally {
            setTranslating(false);
        }
    };

    return (
        <div className={styles.contextMenuOverlay}>
            <div
                ref={menuRef}
                className={styles.contextMenu}
                style={{ left: adjustedStyle.left, top: adjustedStyle.top }}
            >
                {translated && (
                    <div className={styles.contextMenuTranslation}>
                        <div className={styles.contextMenuTranslationLabel}>Translation</div>
                        <div className={styles.contextMenuTranslationText}>{translated}</div>
                    </div>
                )}

                <button className={styles.contextMenuItem} onClick={() => { onCopy(); onClose(); }}>
                    <i className="fas fa-copy" />
                    <span>Copy</span>
                </button>

                <div
                    className={styles.contextMenuItem}
                    onMouseEnter={() => setShowTranslateSub(true)}
                    onMouseLeave={() => setShowTranslateSub(false)}
                >
                    <i className="fas fa-language" />
                    <span>{translating ? 'Translating...' : 'Translate'}</span>
                    <i className="fas fa-chevron-right" style={{ marginLeft: 'auto', fontSize: '0.7rem', opacity: 0.5 }} />

                    {showTranslateSub && (
                        <div className={styles.contextSubMenu}>
                            {LANG_OPTIONS.map((lang) => (
                                <button
                                    key={lang.code}
                                    className={styles.contextSubMenuItem}
                                    onClick={() => handleTranslate(lang.code)}
                                >
                                    {lang.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <button className={styles.contextMenuItem} onClick={() => { onQuote(); onClose(); }}>
                    <i className="fas fa-quote-right" />
                    <span>Quote</span>
                </button>

                {onAiRewrite && messageContent && (
                    <button className={styles.contextMenuItem} onClick={() => { onAiRewrite(messageContent); onClose(); }}>
                        <i className="fas fa-magic" />
                        <span>AI Rewrite</span>
                    </button>
                )}

                <button className={styles.contextMenuItem} onClick={() => { onMultiSelect(); onClose(); }}>
                    <i className="fas fa-check-double" />
                    <span>Select</span>
                </button>

                {isOwn && canRecall && (
                    <button className={`${styles.contextMenuItem} ${styles.contextMenuItemDanger}`} onClick={() => { onRecall(); onClose(); }}>
                        <i className="fas fa-undo-alt" />
                        <span>Recall</span>
                    </button>
                )}
            </div>
        </div>
    );
}
