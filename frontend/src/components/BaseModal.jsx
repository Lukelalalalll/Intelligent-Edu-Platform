import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const overlayStyle = {
    position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
    background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)',
    zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const boxStyle = {
    background: '#fff', width: 340, borderRadius: 24,
    padding: '24px 24px 20px', textAlign: 'center',
    boxShadow: '0 24px 48px rgba(0,0,0,0.15)',
};

export default function BaseModal({ open, onClose, children }) {
    return (
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
                        style={boxStyle}
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    >
                        {children}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
