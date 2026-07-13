import React, { type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import usePrefersReducedMotion from './hooks/usePrefersReducedMotion';
import { getFadeMotion, getModalMotion } from './motion/presets';

interface BaseModalProps {
    open?: boolean;
    onClose?: () => void;
    children?: ReactNode;
    width?: number | string;
}

const boxStyle: React.CSSProperties = {
    background: 'var(--surface-raised)', width: 340, borderRadius: 'var(--radius-lg)',
    padding: '32px 32px 28px', textAlign: 'center',
    color: 'var(--text-main)',
    border: '1px solid var(--line-soft)',
    boxShadow: 'var(--shadow-lg)',
};

export default function BaseModal({ open, onClose, children, width }: BaseModalProps) {
    const prefersReducedMotion = usePrefersReducedMotion();
    const overlayMotion = getFadeMotion(prefersReducedMotion);
    const modalMotion = getModalMotion(prefersReducedMotion);
    const overlayStyle: React.CSSProperties = {
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'var(--scrim-bg)',
        backdropFilter: prefersReducedMotion ? 'none' : 'blur(4px)',
        WebkitBackdropFilter: prefersReducedMotion ? 'none' : 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    };

    return createPortal(
        <AnimatePresence>
            {open && (
                <motion.div
                    style={overlayStyle}
                    onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
                    {...overlayMotion}
                >
                    <motion.div
                        style={{ ...boxStyle, width: width || boxStyle.width }}
                        {...modalMotion}
                    >
                        {children}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}

