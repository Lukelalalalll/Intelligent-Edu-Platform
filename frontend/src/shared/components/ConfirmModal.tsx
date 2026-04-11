/**
 * ConfirmModal — shared confirmation dialog.
 * Replaces the duplicate implementations in features/admin and features/ai-interact.
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

export interface ConfirmModalProps {
    open: boolean;
    title?: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    confirmDanger?: boolean;
    onConfirm: () => void;
    onClose: () => void;
}

const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
};

const cardStyle: React.CSSProperties = {
    background: '#fff',
    borderRadius: 12,
    padding: '28px 32px',
    minWidth: 320,
    maxWidth: 480,
    boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
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
    onConfirm,
    onClose,
}: ConfirmModalProps) {
    return createPortal(
        <AnimatePresence>
            {open && (
                <motion.div
                    style={overlayStyle}
                    onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                >
                    <motion.div
                        style={cardStyle}
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{title}</h3>
                            <button
                                onClick={onClose}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.4rem', lineHeight: 1 }}
                            >
                                &times;
                            </button>
                        </div>
                        {message && (
                            <div style={{ marginBottom: 8, color: '#555', fontSize: '1rem' }}>
                                {message}
                            </div>
                        )}
                        <div style={footerStyle}>
                            <button
                                onClick={onClose}
                                style={{ ...btnBase, background: '#f1f5f9', color: '#333' }}
                            >
                                {cancelLabel}
                            </button>
                            <button
                                onClick={() => { onConfirm(); onClose(); }}
                                style={{
                                    ...btnBase,
                                    background: confirmDanger ? '#f43f5e' : '#3b82f6',
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
