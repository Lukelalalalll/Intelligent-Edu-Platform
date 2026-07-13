/**
 * ConfirmModal — shared confirmation dialog.
 * Replaces the duplicate implementations in features/admin and features/ai-interact.
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import usePrefersReducedMotion from '../hooks/usePrefersReducedMotion';
import { getFadeMotion, getModalMotion } from '../motion/presets';

export interface ConfirmModalProps {
    open: boolean;
    title?: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    confirmDanger?: boolean;
    hideCancel?: boolean;
    onConfirm: () => void;
    onClose: () => void;
}

const cardStyle: React.CSSProperties = {
    background: 'var(--surface-raised)',
    borderRadius: 'var(--radius-lg, 24px)',
    padding: '28px 32px',
    minWidth: 320,
    maxWidth: 480,
    color: 'var(--text-main)',
    border: '1px solid var(--line-soft)',
    boxShadow: 'var(--shadow-lg)',
};

const footerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 24,
};

const btnBase: React.CSSProperties = {
    padding: '8px 20px',
    borderRadius: 8,
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: 500,
};

export default function ConfirmModal({
    open,
    title = 'Confirm',
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    confirmDanger = false,
    hideCancel = false,
    onConfirm,
    onClose,
}: ConfirmModalProps) {
    const prefersReducedMotion = usePrefersReducedMotion();
    const overlayMotion = getFadeMotion(prefersReducedMotion);
    const modalMotion = getModalMotion(prefersReducedMotion);
    const overlayStyle: React.CSSProperties = {
        position: 'fixed',
        inset: 0,
        background: 'var(--scrim-bg)',
        backdropFilter: prefersReducedMotion ? 'none' : 'blur(4px)',
        WebkitBackdropFilter: prefersReducedMotion ? 'none' : 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
    };

    return createPortal(
        <AnimatePresence>
            {open && (
                <motion.div
                    style={overlayStyle}
                    onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
                    {...overlayMotion}
                >
                    <motion.div
                        style={cardStyle}
                        {...modalMotion}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{title}</h3>
                            <button
                                onClick={onClose}
                                style={{ background: 'none', color: 'var(--text-sub)', border: 'none', cursor: 'pointer', fontSize: '1.4rem', lineHeight: 1 }}
                            >
                                &times;
                            </button>
                        </div>
                        {message && (
                            <div style={{ marginBottom: 8, color: 'var(--text-sub)', fontSize: '1rem', whiteSpace: 'pre-wrap' }}>
                                {message}
                            </div>
                        )}
                        <div style={footerStyle}>
                            {!hideCancel && (
                                <button
                                    onClick={onClose}
                                    style={{ ...btnBase, background: 'var(--bg-input)', color: 'var(--text-main)', border: '1px solid var(--line-soft)' }}
                                >
                                    {cancelLabel}
                                </button>
                            )}
                            <button
                                onClick={() => { onConfirm(); onClose(); }}
                                style={{
                                    ...btnBase,
                                    background: confirmDanger ? 'var(--error-color)' : 'var(--primary-color)',
                                    color: '#fff',
                                }}
                            >
                                {confirmLabel}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body,
    );
}
