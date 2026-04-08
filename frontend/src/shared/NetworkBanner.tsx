/**
 * NetworkBanner
 * ──────────────
 * Global offline-notification bar that slides in from the top
 * whenever the device loses network connectivity.
 * Mount once inside <Layout /> (above <main>).
 */
import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useToast } from '../hooks/useToast';
import ToastContainer from './ToastContainer';

export default function NetworkBanner() {
    const { isOffline } = useNetworkStatus();
    const { toasts, showToast, removeToast } = useToast(3000);
    const prevOffline = useRef<boolean | null>(null);

    // Show recovery toast exactly once when connection comes back
    useEffect(() => {
        if (prevOffline.current === null) {
            prevOffline.current = isOffline;
            return;
        }
        if (prevOffline.current && !isOffline) {
            showToast('Connection restored. You are back online.', 'success');
        }
        prevOffline.current = isOffline;
    }, [isOffline, showToast]);

    return (
        <>
            {/* ── Offline banner ── */}
            <AnimatePresence>
                {isOffline && (
                    <motion.div
                        key="offline-banner"
                        initial={{ y: -60, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: -60, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
                        style={bannerStyle}
                        role="alert"
                        aria-live="assertive"
                    >
                        <i className="fas fa-wifi" style={{ opacity: 0.7, marginRight: 8 }} />
                        <span>
                            <strong>No Internet Connection</strong>
                            &nbsp;— Some features are unavailable. Please check your network.
                        </span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Recovery / info toasts ── */}
            <ToastContainer toasts={toasts} onDismiss={removeToast} />
        </>
    );
}

// ── Inline styles (no extra CSS file needed) ─────────────────────────────────

const bannerStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 99998,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '12px 24px',
    background: 'linear-gradient(90deg, #b91c1c, #991b1b)',
    color: '#fff',
    fontSize: '0.9rem',
    fontWeight: 500,
    boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
    letterSpacing: '0.02em',
};
