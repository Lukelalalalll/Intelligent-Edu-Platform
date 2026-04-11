import React, { type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

interface BaseModalProps {
    open?: boolean;
    onClose?: () => void;
    children?: ReactNode;
    width?: number | string;
}

const overlayStyle: React.CSSProperties = {
    position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
    background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)',
    zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const boxStyle: React.CSSProperties = {
    background: '#fff', width: 340, borderRadius: 'var(--radius-lg)',
    padding: '32px 32px 28px', textAlign: 'center',
    boxShadow: '0 24px 48px rgba(0,0,0,0.15)',
};

export default function BaseModal({ open, onClose, children, width }: BaseModalProps) {
    return createPortal(
        <AnimatePresence>
            {open && (
                <motion.div
                    style={overlayStyle}
                    onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                >
                    <motion.div
                        style={{ ...boxStyle, width: width || boxStyle.width }}
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    >
                        {children}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}

